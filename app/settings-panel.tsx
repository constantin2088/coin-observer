'use client';
import { useState } from 'react';
import {
  ALERTS_KEY,
  CHART_KEY,
  PREFS_KEY,
  readStored,
  validateBackup,
} from '@/lib/preferences';

export function SettingsPanel({
  density,
  setDensity,
  sound,
  setSound,
  desktop,
  setDesktop,
}: {
  density: string;
  setDensity: (v: string) => void;
  sound: boolean;
  setSound: (v: boolean) => void;
  desktop: boolean;
  setDesktop: (v: boolean) => void;
}) {
  const [message, setMessage] = useState('');
  async function enableNotifications() {
    if (!('Notification' in window)) {
      setMessage('当前浏览器不支持桌面通知');
      return;
    }
    const permission = await Notification.requestPermission();
    setDesktop(permission === 'granted');
    setMessage(
      permission === 'granted'
        ? '桌面通知已开启，提醒触发时会通知你'
        : '未获得通知权限，可以使用提示音或页内提醒',
    );
  }
  function exportBackup() {
    const data = {
      app: '币观',
      version: 2,
      exportedAt: new Date().toISOString(),
      favorites: readStored('coin-watch', []),
      alerts: readStored(ALERTS_KEY, []),
      history: readStored('coin-alert-history-v2', []),
      preferences: readStored(PREFS_KEY, {}),
      chart: readStored(CHART_KEY, {}),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = `币观备份-${new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('备份已导出，包含自选、提醒和看板设置');
  }
  async function importBackup(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 1000000) throw new Error('备份文件过大');
      const backup = validateBackup(JSON.parse(await file.text()));
      const entries: [string, unknown][] = [
        ['coin-watch', backup.favorites],
        [ALERTS_KEY, backup.alerts],
        ['coin-alert-history-v2', backup.history],
        [PREFS_KEY, backup.preferences],
        [CHART_KEY, backup.chart],
      ];
      const original = entries.map(
        ([key]) => [key, localStorage.getItem(key)] as const,
      );
      try {
        for (const [key, value] of entries)
          localStorage.setItem(key, JSON.stringify(value));
      } catch {
        for (const [key, value] of original) {
          try {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
          } catch {}
        }
        throw new Error('浏览器无法保存设置，导入未完成');
      }
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导入失败');
    }
  }
  return (
    <details className="settings-panel panel">
      <summary>
        看板设置与备份 <span className="muted">布局 · 通知 · 导入导出</span>
      </summary>
      <div className="settings-body">
        <div className="settings-row">
          <span>显示密度</span>
          <button
            aria-pressed={density === 'comfortable'}
            onClick={() => setDensity('comfortable')}
          >
            舒适
          </button>
          <button
            aria-pressed={density === 'compact'}
            onClick={() => setDensity('compact')}
          >
            紧凑
          </button>
        </div>
        <div className="settings-row">
          <label>
            <input
              type="checkbox"
              checked={sound}
              onChange={(e) => {
                setSound(e.target.checked);
                if (e.target.checked)
                  window.dispatchEvent(new Event('coin-test-sound'));
              }}
            />{' '}
            提醒提示音
          </label>
          <button
            onClick={() => {
              if (desktop) setDesktop(false);
              else void enableNotifications();
            }}
            aria-pressed={desktop}
          >
            {desktop ? '关闭桌面通知' : '开启桌面通知'}
          </button>
        </div>
        <div className="settings-row">
          <button onClick={exportBackup}>导出备份</button>
          <label className="import-button">
            导入备份
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                void importBackup(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <span className="muted">
            导入将替换自选、提醒和设置，并重新打开页面。
          </span>
        </div>
        <p className="muted">
          设置自动保存在当前浏览器。通知需要网页保持打开，电脑休眠期间不监测。
        </p>
        {message && <p role="status">{message}</p>}
      </div>
    </details>
  );
}
