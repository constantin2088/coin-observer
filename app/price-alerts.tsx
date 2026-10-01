'use client';
import { useEffect, useState, useRef, type FormEvent } from 'react';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  evaluateAlerts,
  evaluateSourceAlerts,
  PAIRS,
  validAlert,
  money,
  type Coin,
  type PriceAlert,
} from '@/lib/market';
import { readStored, storeValue } from '@/lib/preferences';
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
    [message, setMessage] = useState(''),
    [storageError, setStorageError] = useState('');
  const [source, setSource] = useState<'coingecko' | 'okx'>('coingecko'),
    [quotes, setQuotes] = useState<Coin[]>([]),
    [quoteFailed, setQuoteFailed] = useState(false);
  const [history, setHistory] = useState<PriceAlert[]>([]);
  const announced = useRef(new Set<string>()),
    audio = useRef<AudioContext | null>(null);
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
  const needQuotes =
    Boolean(active && PAIRS[active.id]) ||
    alerts.some((a) => a.source === 'okx' && !a.triggeredAt);
  useEffect(() => {
    if (!needQuotes) return;
    const controller = new AbortController();
    let running = false;
    const load = async () => {
      if (running) return;
      running = true;
      try {
        const r = await fetch('/api/quotes', {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(12000),
          ]),
        });
        if (!r.ok) throw new Error();
        const d = (await r.json()) as { coins: Coin[] };
        if (!Array.isArray(d.coins)) throw new Error();
        if (!controller.signal.aborted) {
          setQuotes(d.coins);
          setQuoteFailed(false);
        }
      } catch {
        if (!controller.signal.aborted) setQuoteFailed(true);
      } finally {
        running = false;
      }
    };
    void load();
    const timer = setInterval(load, 60000);
    window.addEventListener('online', load);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('online', load);
    };
  }, [needQuotes]);
  useEffect(() => {
    try {
      const journal = readStored<unknown[]>('coin-alert-history-v2', []);
      if (Array.isArray(journal))
        setHistory(
          journal
            .filter(validAlert)
            .filter((a) => a.triggeredAt)
            .slice(0, 100),
        );
      const saved = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (Array.isArray(saved)) {
        const items = saved.filter(validAlert).slice(0, 12);
        announced.current = new Set(
          items.filter((a) => a.triggeredAt).map((a) => a.id),
        );
        setAlerts(items);
      }
    } catch {
      setStorageError('无法读取本机提醒记录。');
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(alerts));
      setStorageError('');
    } catch {
      setStorageError('浏览器未能保存提醒，关闭页面后可能丢失。');
    }
  }, [alerts, ready]);
  useEffect(() => {
    if (!ready) return;
    setAlerts((previous) => {
      const next = evaluateSourceAlerts(
        previous,
        coins,
        quotes,
        Date.now(),
        !fetchFailed && Boolean(received),
        !quoteFailed && navigator.onLine,
      );
      return next.some((a, i) => a !== previous[i]) ? next : previous;
    });
  }, [coins, received, ready, fetchFailed, quotes, quoteFailed]);
  useEffect(() => {
    if (!ready) return;
    const hits = alerts.filter(
      (a) => a.triggeredAt && !announced.current.has(a.id),
    );
    if (!hits.length) return;
    hits.forEach((a) => announced.current.add(a.id));
    setHistory((previous) => {
      const next = [...hits, ...previous].slice(0, 100);
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
        new Notification('币观 · 到价提醒', {
          body: hits
            .map(
              (a) =>
                `${a.symbol} ${a.source === 'okx' ? 'OKX USDT' : '美元综合价'} ${money(a.triggeredPrice).replace('$', '')}`,
            )
            .join('；'),
          tag: 'coin-price-alert',
        });
      } catch {
        setMessage('桌面通知发送失败，请查看页内提醒');
      }
    }
  }, [alerts, ready, sound, desktop]);
  useEffect(() => {
    setTarget('');
    setMessage('');
    if (active && !PAIRS[active.id]) setSource('coingecko');
  }, [active?.id]);
  function add(event: FormEvent) {
    event.preventDefault();
    const value = Number(target);
    if (!active || !Number.isFinite(value) || value <= 0) {
      setMessage('请输入大于 0 的有效目标价格。');
      return;
    }
    if (alerts.length >= 12) {
      setMessage('最多保存 12 条提醒，请先删除不需要的记录。');
      return;
    }
    if (
      alerts.some(
        (a) =>
          !a.triggeredAt &&
          a.coinId === active.id &&
          a.target === value &&
          a.direction === direction &&
          (a.source || 'coingecko') === source,
      )
    ) {
      setMessage('这个条件已经在观察中。');
      return;
    }
    const now = Date.now(),
      item: PriceAlert = {
        id: crypto.randomUUID(),
        coinId: active.id,
        symbol: active.symbol.toUpperCase(),
        direction,
        target: value,
        createdAt: now,
        source,
      };
    setAlerts((prev) => [
      ...prev,
      ...((source === 'okx' ? quoteFailed || !navigator.onLine : fetchFailed)
        ? [item]
        : evaluateAlerts([item], source === 'okx' ? quotes : coins, now)),
    ]);
    setTarget('');
    setMessage('已添加一次性提醒。条件满足时将在这里显示。');
  }
  const triggered = alerts.filter((a) => a.triggeredAt);
  return (
    <section className="panel alerts-panel">
      <div className="section-head">
        <div>
          <h2>
            ♧ 到价提醒 <span className="tag">本机</span>
          </h2>
          <p className="muted">
            保持网页打开；随行情刷新检查，触发一次后停止。关闭页面或设备休眠期间不监测。
          </p>
        </div>
        <span className="muted">
          {alerts.filter((a) => !a.triggeredAt).length} 条观察中
        </span>
      </div>
      <div className="quote-legend">
        看板：CoinGecko 美元综合价 <span>｜</span> K 线：OKX USDT 现货价{' '}
        <span>｜</span> 两种报价独立判断提醒
      </div>
      <form className="alert-form" onSubmit={add}>
        <span>
          当前币种 <b>{active?.symbol.toUpperCase() || '—'}</b>
        </span>
        <NativeSelect
          aria-label="提醒报价来源"
          value={source}
          onChange={(e) => setSource(e.target.value as 'coingecko' | 'okx')}
        >
          <NativeSelectOption value="coingecko">
            CoinGecko · 美元综合价
          </NativeSelectOption>
          <NativeSelectOption
            value="okx"
            disabled={!active || !PAIRS[active.id]}
          >
            OKX · USDT 现货价
          </NativeSelectOption>
        </NativeSelect>
        <NativeSelect
          aria-label="到价提醒条件"
          value={direction}
          onChange={(e) => setDirection(e.target.value as 'above' | 'below')}
        >
          <NativeSelectOption value="above">价格达到或高于</NativeSelectOption>
          <NativeSelectOption value="below">价格达到或低于</NativeSelectOption>
        </NativeSelect>
        <label className="price-input">
          <input
            aria-label="提醒目标价格"
            type="number"
            step="any"
            min="0.000000000001"
            required
            placeholder="输入目标价格"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <span>{source === 'okx' ? 'USDT' : 'USD'}</span>
        </label>
        <button
          type="submit"
          className="primary-button"
          disabled={!active || !ready}
        >
          ＋ 添加提醒
        </button>
      </form>
      <p className="source-note">
        当前来源：
        {source === 'okx'
          ? `OKX · ${quoteFailed ? '更新中断' : money(quotes.find((c) => c.id === active?.id)?.current_price).replace('$', '')} USDT`
          : 'CoinGecko · 美元综合价'}
        。超过 5 分钟的报价不触发；已满足条件会立即触发。
      </p>
      {(message || storageError) && (
        <p className="form-message" role="status">
          {storageError || message}
        </p>
      )}
      <div aria-live="polite" aria-atomic="true">
        {triggered.length > 0 && (
          <p className="alert-hit">
            ● {triggered.length} 条提醒已触发：
            {triggered
              .map(
                (a) =>
                  `${a.symbol} ${a.source === 'okx' ? money(a.triggeredPrice).replace('$', '') + ' USDT' : money(a.triggeredPrice)}`,
              )
              .join('；')}
          </p>
        )}
      </div>
      {alerts.length > 0 ? (
        <div className="alert-list">
          {alerts.map((a) => (
            <div
              key={a.id}
              className={`alert-item ${a.triggeredAt ? 'triggered' : ''}`}
            >
              <div>
                <b>{a.symbol}</b>
                <span>
                  {' '}
                  {a.direction === 'above' ? '≥' : '≤'}{' '}
                  {a.source === 'okx'
                    ? money(a.target).replace('$', '') + ' USDT'
                    : money(a.target)}{' '}
                  <span className="tag">
                    {a.source === 'okx' ? 'OKX' : 'CoinGecko'}
                  </span>
                </span>
                <small>
                  {a.triggeredAt
                    ? `已触发 · ${new Date(a.triggeredAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} · ${a.source === 'okx' ? money(a.triggeredPrice).replace('$', '') + ' USDT' : money(a.triggeredPrice)}`
                    : (a.source === 'okx' ? quoteFailed : fetchFailed)
                      ? '更新中断，等待有效报价'
                      : !(a.source === 'okx' ? quotes : coins).some(
                            (c) => c.id === a.coinId,
                          )
                        ? '等待该币种报价（可能已不在前 100）'
                        : '观察中 · 每分钟检查'}
                </small>
              </div>
              {a.triggeredAt && (
                <button
                  className="text-button"
                  onClick={() => {
                    announced.current.delete(a.id);
                    setAlerts((prev) =>
                      prev.map((item) =>
                        item.id === a.id
                          ? {
                              ...item,
                              triggeredAt: undefined,
                              triggeredPrice: undefined,
                            }
                          : item,
                      ),
                    );
                  }}
                >
                  重新启用
                </button>
              )}
              <button
                className="text-button"
                aria-label={`删除 ${a.symbol} ${a.target} 的提醒`}
                onClick={() =>
                  setAlerts((prev) => prev.filter((x) => x.id !== a.id))
                }
              >
                删除
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted no-alerts">先选择一个币种，再设置你关心的价格。</p>
      )}
      <details className="alert-history">
        <summary>触发记录 · {history.length} 条</summary>
        {history.length ? (
          history.slice(0, 20).map((a, i) => (
            <p key={`${a.id}-${a.triggeredAt}-${i}`}>
              <b>{a.symbol}</b> ·{' '}
              {a.source === 'okx' ? 'OKX USDT' : '美元综合价'} ·{' '}
              {money(a.triggeredPrice).replace('$', '')}{' '}
              <span className="muted">
                {new Date(a.triggeredAt!).toLocaleString('zh-CN', {
                  timeZone: 'Asia/Shanghai',
                })}
              </span>
            </p>
          ))
        ) : (
          <p className="muted">
            暂无触发记录。最多保留最近 100 条，此处显示最近 20 条。
          </p>
        )}
      </details>
    </section>
  );
}
