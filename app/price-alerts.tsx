'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  normalizeCoins,
  evaluateSourceAlerts,
  PAIRS,
  validAlert,
  money,
  type Coin,
  type PriceAlert,
} from '@/lib/market';
import { readStored, storeValue } from '@/lib/preferences';
import { fetchFeed } from '@/lib/client-feed';
import { beijingTime } from '@/lib/local-market';
const KEY = 'coin-price-alerts-v1';
export function PriceAlerts({
  coins,
  active,
  received,
  fetchFailed,
  sound,
  desktop,
}: {
  coins: Coin[];
  active: Coin | undefined;
  received: string;
  fetchFailed: boolean;
  sound: boolean;
  desktop: boolean;
}) {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]),
    [ready, setReady] = useState(false),
    [target, setTarget] = useState(''),
    [direction, setDirection] = useState<'above' | 'below'>('above'),
    [source, setSource] = useState<'coingecko' | 'okx'>('coingecko'),
    [kind, setKind] = useState<'price' | 'percent'>('price'),
    [editId, setEditId] = useState<string | null>(null),
    [message, setMessage] = useState(''),
    [storageError, setStorageError] = useState(''),
    [quotes, setQuotes] = useState<Coin[]>([]),
    [quoteFailed, setQuoteFailed] = useState(true),
    [quoteTime, setQuoteTime] = useState(''),
    [history, setHistory] = useState<PriceAlert[]>([]),
    [now, setNow] = useState(Date.now());
  const announced = useRef(new Set<string>()),
    audio = useRef<AudioContext | null>(null);
  const formCoin = editId
    ? coins.find((c) => c.id === alerts.find((a) => a.id === editId)?.coinId)
    : active;
  function playSound() {
    try {
      const context = audio.current ?? new AudioContext();
      audio.current = context;
      void context.resume();
      for (const [frequency, delay] of [
        [660, 0],
        [880, 0.18],
      ]) {
        const oscillator = context.createOscillator(),
          gain = context.createGain();
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.09, context.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          context.currentTime + delay + 0.16,
        );
        oscillator.start(context.currentTime + delay);
        oscillator.stop(context.currentTime + delay + 0.17);
      }
    } catch {
      setMessage('当前浏览器无法播放提示音，页内提醒仍然有效');
    }
  }
  useEffect(() => {
    const test = () => playSound();
    window.addEventListener('coin-test-sound', test);
    return () => {
      window.removeEventListener('coin-test-sound', test);
      void audio.current?.close();
    };
  }, []);
  useEffect(() => {
    const load = () => {
      const saved = readStored<unknown[]>(KEY, []);
      if (Array.isArray(saved)) {
        const items = saved.filter(validAlert).slice(0, 12);
        items
          .filter((a) => a.triggeredAt)
          .forEach((a) => announced.current.add(a.id));
        setAlerts(items);
      }
      const journal = readStored<unknown[]>('coin-alert-history-v2', []);
      if (Array.isArray(journal))
        setHistory(
          journal
            .filter(validAlert)
            .filter((a) => a.triggeredAt)
            .slice(0, 100),
        );
    };
    load();
    setReady(true);
    const changed = (e: StorageEvent) => {
      if (e.key === KEY || e.key === 'coin-alert-history-v2') load();
    };
    window.addEventListener('storage', changed);
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => {
      window.removeEventListener('storage', changed);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (ready) {
      const text = JSON.stringify(alerts);
      try {
        if (localStorage.getItem(KEY) !== text)
          setStorageError(
            storeValue(KEY, alerts)
              ? ''
              : '浏览器未能保存提醒，关闭页面后可能丢失。',
          );
      } catch {
        setStorageError('无法保存提醒，请检查浏览器存储权限');
      }
    }
  }, [alerts, ready]);
  const needQuotes =
    source === 'okx' ||
    alerts.some((a) => a.source === 'okx' && !a.triggeredAt && !a.paused);
  useEffect(() => {
    if (!needQuotes) return;
    let disposed = false,
      running = false;
    const load = async () => {
      if (running) return;
      running = true;
      try {
        const d = await fetchFeed<{
          coins: Coin[];
          fetchedAt: string;
          stale?: boolean;
        }>('/api/quotes');
        if (!disposed) {
          setQuotes(normalizeCoins(d.coins));
          setQuoteTime(d.fetchedAt);
          setQuoteFailed(Boolean(d.stale));
        }
      } catch {
        if (!disposed) setQuoteFailed(true);
      } finally {
        running = false;
      }
    };
    void load();
    const timer = setInterval(load, 60000),
      resume = () => {
        if (document.visibilityState === 'visible') void load();
      };
    window.addEventListener('online', load);
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener('online', load);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [needQuotes]);
  const marketValid =
    !fetchFailed && Boolean(received) && now - Date.parse(received) <= 120000;
  const okxValid =
    !quoteFailed &&
    typeof navigator !== 'undefined' &&
    navigator.onLine &&
    Boolean(quoteTime) &&
    now - Date.parse(quoteTime) <= 120000;
  useEffect(() => {
    if (!ready) return;
    setAlerts((prev) => {
      const next = evaluateSourceAlerts(
        prev,
        coins,
        quotes,
        Date.now(),
        marketValid,
        okxValid,
      );
      return next.some((a, i) => a !== prev[i]) ? next : prev;
    });
  }, [coins, quotes, ready, marketValid, okxValid, now]);
  useEffect(() => {
    if (!ready) return;
    const hits = alerts.filter(
      (a) => a.triggeredAt && !announced.current.has(a.id),
    );
    if (!hits.length) return;
    hits.forEach((a) => announced.current.add(a.id));
    const publish = async () => {
      const owned: PriceAlert[] = [];
      for (const a of hits) {
        const claim = () => {
          const key = `coin-alert-announced-${a.id}`;
          const old = readStored<number>(key, 0);
          if (old === a.createdAt) return;
          storeValue(key, a.createdAt);
          owned.push(a);
        };
        if (navigator.locks)
          await navigator.locks.request('coin-alert:' + a.id, claim);
        else claim();
      }
      if (!owned.length) return;
      setHistory((prev) => {
        const next = [...owned, ...prev].slice(0, 100);
        storeValue('coin-alert-history-v2', next);
        return next;
      });
      if (sound) playSound();
      if (
        desktop &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification('币观 · 价格提醒', {
            body: owned
              .map(
                (a) =>
                  `${a.symbol} ${money(a.triggeredPrice)} · ${a.source === 'okx' ? 'OKX USDT' : '美元综合价'}`,
              )
              .join('；'),
            tag: 'coin-price-alert',
          });
        } catch {
          setMessage('桌面通知发送失败，请查看页内提醒');
        }
      }
    };
    void publish();
  }, [alerts, ready, sound, desktop]);
  function freshCoin(id: string, s: PriceAlert['source']) {
    const c = (s === 'okx' ? quotes : coins).find((x) => x.id === id);
    return (s === 'okx' ? okxValid : marketValid) &&
      c &&
      c.current_price !== null &&
      c.current_price > 0 &&
      Number.isFinite(Date.parse(c.last_updated)) &&
      Date.now() - Date.parse(c.last_updated) <= 300000
      ? c
      : undefined;
  }
  function save(e: FormEvent) {
    e.preventDefault();
    const value = Number(target);
    if (!formCoin || !Number.isFinite(value) || value <= 0) {
      setMessage('请输入大于 0 的有效数值');
      return;
    }
    if (!editId && alerts.length >= 12) {
      setMessage('最多保存 12 条提醒，请删除不需要的记录');
      return;
    }
    const base = freshCoin(formCoin.id, source)?.current_price;
    if (
      kind === 'percent' &&
      (!base || value > 100 || (direction === 'below' && value >= 100))
    ) {
      setMessage(
        !base
          ? '百分比提醒需要当前来源的有效新报价'
          : '百分比必须在 0～100 之间，下跌幅度需小于 100%',
      );
      return;
    }
    const price =
      kind === 'percent'
        ? base! * (1 + ((direction === 'above' ? 1 : -1) * value) / 100)
        : value;
    if (
      alerts.some(
        (a) =>
          a.id !== editId &&
          !a.triggeredAt &&
          !a.paused &&
          a.coinId === formCoin.id &&
          a.target === price &&
          a.direction === direction &&
          (a.source || 'coingecko') === source,
      )
    ) {
      setMessage('这个条件已经在观察中');
      return;
    }
    const item: PriceAlert = {
      id: editId || crypto.randomUUID(),
      coinId: formCoin.id,
      symbol: formCoin.symbol.toUpperCase(),
      source,
      direction,
      kind,
      target: price,
      createdAt: Date.now(),
      ...(kind === 'percent' ? { basePrice: base!, percentTarget: value } : {}),
    };
    announced.current.delete(item.id);
    const evaluated = evaluateSourceAlerts(
      [item],
      coins,
      quotes,
      Date.now(),
      marketValid,
      okxValid,
    )[0];
    setAlerts((prev) =>
      editId
        ? prev.map((a) => (a.id === editId ? evaluated : a))
        : [...prev, evaluated],
    );
    setEditId(null);
    setTarget('');
    setMessage('提醒已保存；满足条件后触发一次');
  }
  function edit(a: PriceAlert) {
    setEditId(a.id);
    setSource(a.source || 'coingecko');
    setDirection(a.direction);
    setKind(a.kind || 'price');
    setTarget(String(a.kind === 'percent' ? a.percentTarget : a.target));
    setMessage('编辑后重新开始监测；百分比条件将按新报价重新计算');
  }
  function rearm(a: PriceAlert) {
    const base = freshCoin(a.coinId, a.source)?.current_price;
    if (a.kind === 'percent' && !base) {
      setMessage('当前报价延迟，暂不能重新设置百分比基准');
      return;
    }
    announced.current.delete(a.id);
    setAlerts((prev) =>
      prev.map((x) =>
        x.id === a.id
          ? evaluateSourceAlerts(
              [
                {
                  ...x,
                  triggeredAt: undefined,
                  triggeredPrice: undefined,
                  paused: false,
                  createdAt: Math.max(Date.now(), x.createdAt + 1),
                  ...(x.kind === 'percent'
                    ? {
                        basePrice: base!,
                        target:
                          base! *
                          (1 +
                            ((x.direction === 'above' ? 1 : -1) *
                              x.percentTarget!) /
                              100),
                      }
                    : {}),
                },
              ],
              coins,
              quotes,
              Date.now(),
              marketValid,
              okxValid,
            )[0]
          : x,
      ),
    );
  }
  function status(a: PriceAlert) {
    if (a.triggeredAt) return '已触发';
    if (a.paused) return '已暂停';
    return freshCoin(a.coinId, a.source) ? '正在监测' : '数据延迟 · 暂停判断';
  }
  return (
    <section className="panel alerts-panel">
      <div className="section-head">
        <div>
          <h2>
            价格提醒 <span className="tag">本机</span>
          </h2>
          <p className="muted">
            网页保持打开时每分钟检查；恢复联网或切回页面时补查。关闭网页或电脑休眠期间不监测。
          </p>
        </div>
        <span className="muted">
          {alerts.filter((a) => !a.triggeredAt && !a.paused).length} 条待触发
        </span>
      </div>
      <form className="alert-form" onSubmit={save}>
        <span>
          当前币种 <b>{formCoin?.symbol.toUpperCase() || '—'}</b>
        </span>
        <select
          aria-label="提醒报价来源"
          value={source}
          onChange={(e) => setSource(e.target.value as 'coingecko' | 'okx')}
        >
          <option value="coingecko">CoinGecko · 美元综合价</option>
          <option value="okx" disabled={!formCoin || !PAIRS[formCoin.id]}>
            OKX · USDT 现货价
          </option>
        </select>
        <select
          aria-label="提醒类型"
          value={kind}
          onChange={(e) => setKind(e.target.value as 'price' | 'percent')}
        >
          <option value="price">目标价格</option>
          <option value="percent">相对当前价格百分比</option>
        </select>
        <select
          aria-label="到价提醒条件"
          value={direction}
          onChange={(e) => setDirection(e.target.value as 'above' | 'below')}
        >
          <option value="above">
            {kind === 'percent' ? '上涨达到' : '价格达到或高于'}
          </option>
          <option value="below">
            {kind === 'percent' ? '下跌达到' : '价格达到或低于'}
          </option>
        </select>
        <label className="price-input">
          <input
            aria-label="提醒目标数值"
            type="number"
            step="any"
            min="0.000000000001"
            required
            placeholder={kind === 'percent' ? '输入变化百分比' : '输入目标价格'}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <span>
            {kind === 'percent' ? '%' : source === 'okx' ? 'USDT' : 'USD'}
          </span>
        </label>
        <button
          className="primary-button"
          disabled={!formCoin || !ready}
          type="submit"
        >
          {editId ? '保存修改' : '添加提醒'}
        </button>
        {editId && (
          <button
            type="button"
            onClick={() => {
              setEditId(null);
              setTarget('');
              setMessage('');
            }}
          >
            取消编辑
          </button>
        )}
      </form>
      <p className="source-note">
        两种来源独立判断；超过 5
        分钟的报价不触发。百分比提醒固定创建时的基准价，重新启用时更新基准。
      </p>
      {(message || storageError) && (
        <p className="form-message" role="status">
          {storageError || message}
        </p>
      )}
      <div className="alert-list" aria-live="polite">
        {alerts.map((a) => (
          <div
            key={a.id}
            className={`alert-item ${a.triggeredAt ? 'triggered' : ''}`}
          >
            <div>
              <b>{a.symbol}</b>{' '}
              <span>
                {a.direction === 'above' ? '≥' : '≤'} {money(a.target)} ·{' '}
                {a.source === 'okx' ? 'OKX USDT' : '美元综合价'}
              </span>
              {a.kind === 'percent' && (
                <small className={a.direction === 'above' ? 'up' : 'down'}>
                  {a.direction === 'above' ? '+' : '−'}
                  {a.percentTarget}% · 基准 {money(a.basePrice)}
                </small>
              )}
              <small className="alert-state">
                {status(a)}
                {a.triggeredAt
                  ? ` · ${beijingTime(a.triggeredAt)} · ${money(a.triggeredPrice)}`
                  : ''}
              </small>
            </div>
            <div className="alert-actions">
              <button className="text-button" onClick={() => edit(a)}>
                编辑
              </button>
              {a.triggeredAt ? (
                <button className="text-button" onClick={() => rearm(a)}>
                  重新启用
                </button>
              ) : (
                <button
                  className="text-button"
                  onClick={() =>
                    setAlerts((prev) =>
                      prev.map((x) =>
                        x.id === a.id
                          ? evaluateSourceAlerts(
                              [{ ...x, paused: !x.paused }],
                              coins,
                              quotes,
                              Date.now(),
                              marketValid,
                              okxValid,
                            )[0]
                          : x,
                      ),
                    )
                  }
                >
                  {a.paused ? '继续监测' : '暂停'}
                </button>
              )}
              <button
                className="text-button"
                aria-label={`删除 ${a.symbol} ${a.target} 的提醒`}
                onClick={() => {
                  setAlerts((prev) => prev.filter((x) => x.id !== a.id));
                  if (editId === a.id) setEditId(null);
                }}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
      {!alerts.length && (
        <p className="muted no-alerts">选择币种后，添加目标价或百分比提醒。</p>
      )}
      <details className="alert-history">
        <summary>触发记录 · {history.length} 条</summary>
        {history.slice(0, 20).map((a, i) => (
          <p key={`${a.id}-${a.triggeredAt}-${i}`}>
            <b>{a.symbol}</b> · {money(a.triggeredPrice)} ·{' '}
            {a.source === 'okx' ? 'OKX USDT' : '美元综合价'}{' '}
            <span className="muted">{beijingTime(a.triggeredAt!)}</span>
          </p>
        ))}
        {!history.length && (
          <p className="muted">暂无记录，最多保留最近 100 条。</p>
        )}
      </details>
    </section>
  );
}
