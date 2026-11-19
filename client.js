/**
 * CoolMe Toolkit browser bundle.
 *
 * One ModuleLoader entry owns the left-navigation page and all three UI tools.
 * Feature-local state, locale namespaces, storage keys and effect cleanup are
 * preserved inside isolated module closures.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-coolme-toolkit',
  factory(require) {
    const ConversationModule = (() => {
    const React = require('react');
    const h = React.createElement;

    const NS = 'dsh-conversation-width';
    const PKG = '@local/dsh-coolme-toolkit';
    const STORAGE_KEY = 'dsh:conversation-content-percent';
    /** The app's own default ratio (`.64`), which also means "not overridden". */
    const DEFAULT_PERCENT = 64;
    const MIN = 20;
    const MAX = 100;
    const STEP = 1;
    /** Absolute floor so a narrow column can never collapse the transcript. */
    const WIDTH_FLOOR = '320px';

    const css = `
.dscw-group{border-bottom:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:8px;padding:16px 0;display:flex}
.dscw-title{color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}
.dscw-description{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dscw-controls{flex-direction:column;gap:10px;margin-top:6px;display:flex}
.dscw-row{align-items:center;gap:10px;display:flex}
.dscw-knob{align-items:center;gap:10px;display:flex}
.dscw-knob-label{width:92px;color:var(--dsw-alias-label-secondary);flex:none;font-size:12px;line-height:18px}
.dscw-slider{min-width:0;accent-color:var(--dsw-alias-state-business-primary);flex:1}
.dscw-number-wrap{flex:none;align-items:center;gap:4px;display:inline-flex}
.dscw-number{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);width:56px;height:26px;color:var(--dsw-alias-label-primary);text-align:right;border-radius:8px;padding:0 6px;font-size:12px;line-height:18px;font-family:inherit}
.dscw-number:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dscw-unit{width:18px;color:var(--dsw-alias-label-tertiary);flex:none;font-size:12px;line-height:18px}
.dscw-reset{border:1px solid var(--dsw-alias-border-l2);height:26px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:8px;padding:0 12px;font-size:12px;line-height:18px;font-family:inherit}
.dscw-reset:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dscw-reset:disabled{color:var(--dsw-alias-label-caption);cursor:default;opacity:.6}
`;

    /** Texts used only when the locale seat is unavailable. */
    const FALLBACK = {
      title: '会话内容宽度',
      description: '会话正文占主内容区宽度的百分比。官方默认 64%，且夹在 680–920px；改动后按你的百分比，上不封顶。',
      percent: '宽度',
      reset: '重置',
    };

    function clampPercent(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) return DEFAULT_PERCENT;
      return Math.min(MAX, Math.max(MIN, Math.round(number)));
    }

    function normalize(raw) {
      const value = raw === null || typeof raw !== 'object' ? NaN : raw.percent;
      if (typeof value !== 'number' || !Number.isFinite(value)) return { percent: DEFAULT_PERCENT };
      return { percent: clampPercent(value) };
    }

    function readStored() {
      try {
        return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
      } catch {
        return { percent: DEFAULT_PERCENT };
      }
    }

    let preference = readStored();
    const listeners = new Set();

    const getPreference = () => preference;
    const same = (a, b) => a.percent === b.percent;

    function subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }

    function announce() {
      for (const listener of [...listeners]) listener();
    }

    function write(next) {
      const changed = !same(next, preference);
      preference = next;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
      } catch {
        /* private mode or storage disabled: the in-memory value still applies */
      }
      if (changed) announce();
    }

    function reset() {
      write({ percent: DEFAULT_PERCENT });
    }

    function applyExternal(next) {
      if (same(next, preference)) return;
      preference = next;
      announce();
    }

    function usePreference() {
      return React.useSyncExternalStore(subscribe, getPreference, getPreference);
    }

    /** The override rule; empty while the ratio is the app's own default. */
    function overrideCss(current) {
      if (current.percent === DEFAULT_PERCENT) return '';
      const column = 'var(--dsh-conversation-column-width, 0px)';
      const width = `max(${WIDTH_FLOOR}, calc(${column} * ${current.percent / 100}))`;
      return [
        `body [data-conversation-content]{--dsh-chat-user-width:${width}}`,
        /* The shipped drag handles persist a px width this rule shadows, so while
           percent mode owns the axis they are hidden inside the main Conversation
           (`data-slot="main"` is the main panel's own slot anchor) rather than
           left visibly inert. */
        '[data-slot="main"] [data-width-handle]{display:none}',
      ].join('');
    }

    /**
     * Frame-wide stylesheet outlet: one rule for the whole conversation,
     * present on every settings section and every session.
     */
    function WidthStyle() {
      const text = overrideCss(usePreference());
      if (text === '') return null;
      return h('style', { 'data-plugin': PKG, dangerouslySetInnerHTML: { __html: text } });
    }

    /** One slider + number box, wired to the single percentage value. */
    function Knob(props) {
      const { label, unit, value, onChange } = props;
      const min = props.min ?? MIN;
      const max = props.max ?? MAX;
      const step = props.step ?? STEP;
      const [draft, setDraft] = React.useState(null);
      const shown = draft ?? String(value);

      const commit = (raw) => {
        const text = String(raw).trim();
        const number = Number(text);
        onChange(text === '' || !Number.isFinite(number) ? DEFAULT_PERCENT : clampPercent(number));
        setDraft(null);
      };

      const onKeyDown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit(shown);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          setDraft(null);
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          onChange(clampPercent(value + (event.key === 'ArrowUp' ? step : -step)));
          setDraft(null);
        }
      };

      return h('div', { className: 'dscw-knob' },
        h('span', { className: 'dscw-knob-label' }, label),
        h('input', {
          className: 'dscw-slider',
          type: 'range',
          min,
          max,
          step,
          value,
          'aria-label': label,
          'aria-valuetext': `${value}${unit}`,
          onChange: (event) => onChange(clampPercent(Number(event.target.value))),
        }),
        h('span', { className: 'dscw-number-wrap' },
          h('input', {
            className: 'dscw-number',
            type: 'text',
            inputMode: 'numeric',
            value: shown,
            'aria-label': label,
            onChange: (event) => setDraft(event.target.value),
            onBlur: () => commit(shown),
            onKeyDown,
          }),
          h('span', { className: 'dscw-unit' }, unit)));
    }

    /** The General section group: title, description, the width slider, reset. */
    function WidthGroup(props) {
      const tr = typeof props.t === 'function'
        ? props.t
        : (key) => (FALLBACK[key] !== undefined ? FALLBACK[key] : key);
      const current = usePreference();

      return h('div', { className: 'dscw-group' },
        h('div', { className: 'dscw-title' }, tr('title')),
        h('div', { className: 'dscw-description' }, tr('description')),
        h('div', { className: 'dscw-controls' },
          h(Knob, {
            label: tr('percent'),
            unit: '%',
            min: MIN,
            max: MAX,
            step: STEP,
            value: current.percent,
            onChange: (value) => write({ percent: clampPercent(value) }),
          }),
          h('div', { className: 'dscw-row' },
            h('button', {
              type: 'button',
              className: 'dscw-reset',
              disabled: current.percent === DEFAULT_PERCENT,
              onClick: reset,
            }, tr('reset')))));
    }

    function apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'zh', {
          title: '会话内容宽度',
          description: '会话正文占主内容区宽度的百分比。官方默认 64%，且夹在 680–920px；改动后按你的百分比，上不封顶。',
          percent: '宽度',
          reset: '重置',
        }), 'dsh-conversation-width: zh dictionary');
        ctx.effect(() => ctx.locale.register(NS, 'en', {
          title: 'Conversation content width',
          description: 'Percentage of the main column width. The app default is 64%, clamped to 680\u2013920px; once changed your percentage rules without that ceiling.',
          percent: 'Width',
          reset: 'Reset',
        }), 'dsh-conversation-width: en dictionary');

        ctx.effect(() => {
          const onStorage = (event) => {
            if (event.key !== null && event.key !== STORAGE_KEY) return;
            applyExternal(readStored());
          };
          window.addEventListener('storage', onStorage);
          return () => { window.removeEventListener('storage', onStorage); };
        }, 'dsh-conversation-width: cross-tab sync');

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'dsh-conversation-width-style',
          order: 901,
        }, WidthStyle));

    }

    return { NS, css, WidthGroup, WidthStyle, apply };

})();

const SettingsModule = (() => {
    const React = require('react');
    const h = React.createElement;

    const NS = 'dsh-settings-size';
    const PKG = '@local/dsh-coolme-toolkit';
    const STORAGE_KEY = 'dsh:settings-size';
    /** The modal layer's own attribute hook; stable across theme/package upgrades. */
    const PANEL_SELECTOR = 'body [data-shortcut-modal="settings"]';

    /** The dialog's own shipped size, and the ranges worth dragging through. */
    const FIELDS = {
      width: { min: 480, max: 2000, step: 10, fallback: 800, unit: 'px' },
      height: { min: 400, max: 1200, step: 10, fallback: 800, unit: 'px' },
    };
    const DEFAULTS = { width: FIELDS.width.fallback, height: FIELDS.height.fallback };

    const css = `
.dssz-group{border-bottom:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:8px;padding:16px 0;display:flex}
.dssz-title{color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}
.dssz-description{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dssz-controls{flex-direction:column;gap:10px;margin-top:6px;display:flex}
.dssz-row{align-items:center;gap:10px;display:flex}
.dssz-knob{align-items:center;gap:10px;display:flex}
.dssz-knob-label{width:92px;color:var(--dsw-alias-label-secondary);flex:none;font-size:12px;line-height:18px}
.dssz-slider{min-width:0;accent-color:var(--dsw-alias-state-business-primary);flex:1}
.dssz-number-wrap{flex:none;align-items:center;gap:4px;display:inline-flex}
.dssz-number{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);width:56px;height:26px;color:var(--dsw-alias-label-primary);text-align:right;border-radius:8px;padding:0 6px;font-size:12px;line-height:18px;font-family:inherit}
.dssz-number:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dssz-unit{width:18px;color:var(--dsw-alias-label-tertiary);flex:none;font-size:12px;line-height:18px}
.dssz-reset{border:1px solid var(--dsw-alias-border-l2);height:26px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:8px;padding:0 12px;font-size:12px;line-height:18px;font-family:inherit}
.dssz-reset:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dssz-reset:disabled{color:var(--dsw-alias-label-caption);cursor:default;opacity:.6}
`;

    /** Texts used only when the locale seat is unavailable. */
    const FALLBACK = {
      title: '设置弹窗尺寸',
      description: '设置面板的宽度与高度；官方默认 800 × min(800, 窗口高 − 48px)，值为默认时不改动。',
      width: '宽度',
      height: '高度',
      reset: '重置',
    };

    function clampField(kind, value) {
      const field = FIELDS[kind];
      const number = Number(value);
      if (!Number.isFinite(number)) return field.fallback;
      return Math.min(field.max, Math.max(field.min, Math.round(number)));
    }

    function normalize(raw) {
      const next = { ...DEFAULTS };
      if (raw === null || typeof raw !== 'object') return next;
      for (const kind of ['width', 'height']) {
        if (raw[kind] === undefined || raw[kind] === null) continue;
        next[kind] = clampField(kind, raw[kind]);
      }
      return next;
    }

    function readStored() {
      try {
        return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
      } catch {
        return { ...DEFAULTS };
      }
    }

    let size = readStored();
    const listeners = new Set();

    const getSize = () => size;
    const same = (a, b) => a.width === b.width && a.height === b.height;

    function subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }

    function announce() {
      for (const listener of [...listeners]) listener();
    }

    function write(next) {
      const changed = !same(next, size);
      size = next;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(size));
      } catch {
        /* private mode or storage disabled: the in-memory value still applies */
      }
      if (changed) announce();
    }

    function setField(kind, value) {
      write({ ...size, [kind]: clampField(kind, value) });
    }

    function resetAll() {
      write({ ...DEFAULTS });
    }

    function applyExternal(next) {
      if (same(next, size)) return;
      size = next;
      announce();
    }

    function useSize() {
      return React.useSyncExternalStore(subscribe, getSize, getSize);
    }

    const isDefault = (current) => current.width === DEFAULTS.width && current.height === DEFAULTS.height;

    /** The override rule; empty while both values are the dialog's own defaults. */
    function overrideCss(current) {
      const rules = [];
      if (current.width !== DEFAULTS.width) rules.push(`width:${current.width}px`);
      if (current.height !== DEFAULTS.height) {
        rules.push(`height:${current.height}px`, 'max-height:calc(100vh - 48px)');
      }
      return rules.length === 0 ? '' : `${PANEL_SELECTOR}{${rules.join(';')}}`;
    }

    /**
     * Frame-wide stylesheet outlet. It renders nothing but the override rule, so
     * the dialog keeps the user's size on every settings section.
     */
    function SizeStyle() {
      const text = overrideCss(useSize());
      if (text === '') return null;
      return h('style', { 'data-plugin': PKG, dangerouslySetInnerHTML: { __html: text } });
    }

    /** One slider + number box, wired to a single value. */
    function Knob(props) {
      const { label, unit, min, max, step, value, fallback, onChange } = props;
      const [draft, setDraft] = React.useState(null);
      const clamp = (number) => Math.min(max, Math.max(min, Number.isFinite(number) ? number : min));
      const shown = draft ?? String(value);

      const commit = (raw) => {
        const text = String(raw).trim();
        const number = Number(text);
        onChange(text === '' || !Number.isFinite(number) ? fallback : clamp(number));
        setDraft(null);
      };

      const onKeyDown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit(shown);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          setDraft(null);
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          onChange(clamp(value + (event.key === 'ArrowUp' ? step : -step)));
          setDraft(null);
        }
      };

      return h('div', { className: 'dssz-knob' },
        h('span', { className: 'dssz-knob-label' }, label),
        h('input', {
          className: 'dssz-slider',
          type: 'range',
          min,
          max,
          step,
          value,
          'aria-label': label,
          'aria-valuetext': `${value}${unit}`,
          onChange: (event) => onChange(clamp(Number(event.target.value))),
        }),
        h('span', { className: 'dssz-number-wrap' },
          h('input', {
            className: 'dssz-number',
            type: 'text',
            inputMode: 'numeric',
            value: shown,
            'aria-label': label,
            onChange: (event) => setDraft(event.target.value),
            onBlur: () => commit(shown),
            onKeyDown,
          }),
          h('span', { className: 'dssz-unit' }, unit)));
    }

    /** The General section group: title, description, one slider per property. */
    function SizeGroup(props) {
      const tr = typeof props.t === 'function'
        ? props.t
        : (key) => (FALLBACK[key] !== undefined ? FALLBACK[key] : key);
      const current = useSize();

      const knob = (kind) => h(Knob, {
        key: kind,
        label: tr(kind),
        unit: FIELDS[kind].unit,
        min: FIELDS[kind].min,
        max: FIELDS[kind].max,
        step: FIELDS[kind].step,
        fallback: FIELDS[kind].fallback,
        value: current[kind],
        onChange: (value) => setField(kind, value),
      });

      return h('div', { className: 'dssz-group' },
        h('div', { className: 'dssz-title' }, tr('title')),
        h('div', { className: 'dssz-description' }, tr('description')),
        h('div', { className: 'dssz-controls' },
          knob('width'),
          knob('height'),
          h('div', { className: 'dssz-row' },
            h('button', {
              type: 'button',
              className: 'dssz-reset',
              disabled: isDefault(current),
              onClick: resetAll,
            }, tr('reset')))));
    }

    function apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'zh', {
          title: '设置弹窗尺寸',
          description: '设置面板的宽度与高度；官方默认 800 × min(800, 窗口高 − 48px)，值为默认时不改动。',
          width: '宽度',
          height: '高度',
          reset: '重置',
        }), 'dsh-settings-size: zh dictionary');
        ctx.effect(() => ctx.locale.register(NS, 'en', {
          title: 'Settings dialog size',
          description: 'Width and height of the settings dialog. Defaults to 800 \u00d7 min(800, window height \u2212 48px); a default value changes nothing.',
          width: 'Width',
          height: 'Height',
          reset: 'Reset',
        }), 'dsh-settings-size: en dictionary');

        ctx.effect(() => {
          const onStorage = (event) => {
            if (event.key !== null && event.key !== STORAGE_KEY) return;
            applyExternal(readStored());
          };
          window.addEventListener('storage', onStorage);
          return () => { window.removeEventListener('storage', onStorage); };
        }, 'dsh-settings-size: cross-tab sync');

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'dsh-settings-size-style',
          order: 900,
        }, SizeStyle));

    }

    return { NS, css, SizeGroup, SizeStyle, apply };

})();

const RestartModule = (() => {
    const React = require('react');
    const h = React.createElement;

    const NS = 'dsh-service-restart';
    const PKG = '@local/dsh-coolme-toolkit';
    const ROUTE = '/api/dsh-web-restart';
    const POLL_INTERVAL_MS = 700;
    const POLL_ATTEMPTS = 170;
    /** ~14s of identical `bootId` answers: the restart never took effect. */
    const SAME_BOOT_LIMIT = 20;
    const ARM_TIMEOUT_MS = 6000;

    const css = `
.dsrs-group{border-bottom:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:8px;padding:16px 0;display:flex}
.dsrs-title{color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}
.dsrs-description{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dsrs-controls{flex-direction:column;gap:10px;margin-top:6px;display:flex}
.dsrs-row{align-items:center;gap:10px;display:flex}
.dsrs-button{border:1px solid var(--dsw-alias-border-l2);height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:8px;padding:0 12px;font-size:12px;line-height:18px;font-family:inherit;align-items:center;gap:6px;display:inline-flex}
.dsrs-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsrs-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsrs-button[data-phase=confirm]{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 45%, var(--dsw-alias-border-l2))}
.dsrs-button[data-phase=done]{color:var(--dsw-alias-state-success-primary)}
.dsrs-button[data-phase=error],.dsrs-button[data-phase=timeout]{color:var(--dsw-alias-state-error-primary)}
.dsrs-button:disabled{cursor:default;opacity:.75}
.dsrs-icon{flex:none;display:inline-flex}
.dsrs-spin{animation:dsrs-spin 1s linear infinite}
@keyframes dsrs-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.dsrs-spin{animation:none}}
`;

    /** Texts used only when the locale seat is unavailable. */
    const FALLBACK = {
      title: '服务重启',
      description: '等价于 systemctl restart dsh-web.service；会中断正在运行的会话。为避免误触，需要点两次。',
      restart: '重启服务',
      hint: '执行 systemctl restart dsh-web.service（会中断正在运行的会话）',
      confirm: '再点一次确认重启',
      scheduling: '正在下发重启…',
      waiting: '等待服务恢复…',
      done: '服务已恢复，正在刷新…',
      error: '重启未生效，请查看日志',
      timeout: '服务未恢复，请手动刷新页面',
    };

    const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

    async function probe() {
      const response = await fetch(`${ROUTE}?probe=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error(`probe ${response.status}`);
      return response.json();
    }

    /** Power glyph; a plain arc "C" with the bar in the gap. */
    function PowerGlyph(size) {
      return h('svg', {
        className: 'dsrs-icon',
        viewBox: '0 0 16 16',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        'aria-hidden': true,
      },
        h('path', { d: 'M8 2v6' }),
        h('path', { d: 'M11.8 3.9A5.6 5.6 0 1 1 4.2 3.9' }),
      );
    }

    function SpinnerGlyph(size) {
      return h('svg', {
        className: 'dsrs-icon dsrs-spin',
        viewBox: '0 0 16 16',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        'aria-hidden': true,
      }, h('path', { d: 'M8 1.8a6.2 6.2 0 1 0 6.2 6.2' }));
    }

    function CheckGlyph(size) {
      return h('svg', {
        className: 'dsrs-icon',
        viewBox: '0 0 16 16',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      }, h('path', { d: 'M3.2 8.6l3.1 3.1 6.5-6.6' }));
    }

    function RestartGroup(props) {
      const tr = typeof props.t === 'function'
        ? props.t
        : (key) => (FALLBACK[key] !== undefined ? FALLBACK[key] : key);

      const [phase, setPhase] = React.useState('idle');
      const [supported, setSupported] = React.useState(null);
      const alive = React.useRef(true);
      React.useEffect(() => () => { alive.current = false; }, []);

      // Host is authoritative: unsupported platforms render no restart card.
      React.useEffect(() => {
        let active = true;
        let timer;
        const check = (attempt) => {
          probe()
            .then((info) => { if (active) setSupported(info.available === true); })
            .catch(() => {
              if (!active) return;
              // The Host route can appear just after this page mounts.
              if (attempt === 0) timer = setTimeout(() => check(1), 2500);
              else setSupported(false);
            });
        };
        check(0);
        return () => { active = false; if (timer !== undefined) clearTimeout(timer); };
      }, []);

      // "Armed" is a state the user can walk away from; reset it.
      React.useEffect(() => {
        if (phase !== 'confirm') return undefined;
        const timer = setTimeout(() => { if (alive.current) setPhase('idle'); }, ARM_TIMEOUT_MS);
        return () => clearTimeout(timer);
      }, [phase]);

      const settle = (next) => { if (alive.current) setPhase(next); };

      const run = async () => {
        setPhase('scheduling');
        const before = await probe().catch(() => null);

        let response;
        try {
          response = await fetch(ROUTE, {
            method: 'POST',
            cache: 'no-store',
            credentials: 'same-origin',
          });
        } catch {
          settle('error');
          return;
        }
        if (!response.ok) {
          settle('error');
          return;
        }

        setPhase('waiting');
        const previous = before !== null && typeof before.bootId === 'string' ? before.bootId : null;
        let sameBoot = 0;

        for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
          await sleep(POLL_INTERVAL_MS);
          if (!alive.current) return;
          try {
            const info = await probe();
            if (previous === null || info.bootId !== previous) {
              settle('done');
              setTimeout(() => { location.reload(); }, 700);
              return;
            }
            // The old process is still answering long after the POST: the
            // restart did not take effect (bad unit name, systemd refused it).
            sameBoot += 1;
            if (sameBoot >= SAME_BOOT_LIMIT) {
              settle('error');
              return;
            }
          } catch {
            /* the old process is down (or restarting): keep waiting */
          }
        }
        settle('timeout');
      };

      const onClick = () => {
        if (phase === 'confirm') { void run(); return; }
        // A resolved failure can be retried without reloading the page.
        setPhase('confirm');
      };

      const busy = phase === 'scheduling' || phase === 'waiting' || phase === 'done';
      const key = phase === 'idle' ? 'restart' : phase;
      const glyph = busy
        ? SpinnerGlyph(13)
        : phase === 'done' ? CheckGlyph(13) : PowerGlyph(13);

      const button = h('button', {
        type: 'button',
        className: 'dsrs-button',
        'data-phase': phase,
        'aria-busy': busy ? 'true' : undefined,
        'aria-label': tr(key),
        title: tr('hint'),
        disabled: busy,
        onClick,
      }, glyph, h('span', null, tr(key)));

      if (supported !== true) return null;

      const content = h('div', { className: 'dsrs-group' },
        h('div', { className: 'dsrs-title' }, tr('title')),
        h('div', { className: 'dsrs-description' }, tr('description')),
        h('div', { className: 'dsrs-controls' },
          h('div', { className: 'dsrs-row' }, button)));
      return h('section', { className: 'dscmtk-card' }, content);
    }

    function apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'zh', {
          title: '服务重启',
          description: '等价于 systemctl restart dsh-web.service；会中断正在运行的会话。为避免误触，需要点两次。',
          restart: '重启服务',
          hint: '执行 systemctl restart dsh-web.service（会中断正在运行的会话）',
          confirm: '再点一次确认重启',
          scheduling: '正在下发重启…',
          waiting: '等待服务恢复…',
          done: '服务已恢复，正在刷新…',
          error: '重启未生效，请查看日志',
          timeout: '服务未恢复，请手动刷新页面',
        }), 'dsh-service-restart: zh dictionary');
        ctx.effect(() => ctx.locale.register(NS, 'en', {
          title: 'Service restart',
          description: 'Runs systemctl restart dsh-web.service. It interrupts running sessions, so it takes two clicks.',
          restart: 'Restart service',
          hint: 'Runs systemctl restart dsh-web.service (interrupts running sessions)',
          confirm: 'Click again to confirm',
          scheduling: 'Requesting restart\u2026',
          waiting: 'Waiting for the service\u2026',
          done: 'Service is back, reloading\u2026',
          error: 'Restart did not take effect, check the log',
          timeout: 'Service did not come back, reload manually',
        }), 'dsh-service-restart: en dictionary');

    }

    return { NS, css, RestartGroup, apply };

})();



    const React = require('react');
    const h = React.createElement;
    const NS = 'dsh-coolme-toolkit';
    const PKG = '@local/dsh-coolme-toolkit';
    const NAV_ID = 'dsh-coolme-toolkit';

    const css = `
.dscmtk-page{height:100%;overflow:auto;box-sizing:border-box;padding:28px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1)}
.dscmtk-container{max-width:960px;margin:0 auto;flex-direction:column;gap:16px;display:flex}
.dscmtk-header{margin-bottom:4px}
.dscmtk-title{font-size:22px;line-height:30px;font-weight:600;margin:0}
.dscmtk-description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px;margin:6px 0 0}
.dscmtk-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:12px;padding:18px 20px}
.dscmtk-card .dscw-group,.dscmtk-card .dssz-group,.dscmtk-card .dsrs-group{border-bottom:0;padding:0}
.dscmtk-icon{display:block}
@media (max-width:640px){.dscmtk-page{padding:16px}.dscmtk-card{padding:16px}}
`;

    function ToolkitIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 18;
      return h('svg', {
        className: 'dscmtk-icon',
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        'aria-hidden': true,
      },
        h('path', { d: 'M4 7h16M4 17h16' }),
        h('circle', { cx: 9, cy: 7, r: 2, fill: 'var(--dsw-alias-bg-layer-1)' }),
        h('circle', { cx: 15, cy: 17, r: 2, fill: 'var(--dsw-alias-bg-layer-1)' }));
    }

    function ToolkitBaseStyle() {
      const text = [css, ConversationModule.css, SettingsModule.css, RestartModule.css].join('\n');
      return h('style', { 'data-plugin': PKG, dangerouslySetInnerHTML: { __html: text } });
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'zh', {
          title: 'CoolMe 工具箱',
          description: '会话与设置界面调整，以及本机 dsh 服务维护。',
        }), 'dsh-coolme-toolkit: zh dictionary');
        ctx.effect(() => ctx.locale.register(NS, 'en', {
          title: 'CoolMe Toolkit',
          description: 'Conversation and settings UI controls, plus local dsh service maintenance.',
        }), 'dsh-coolme-toolkit: en dictionary');

        // Each feature keeps its own dictionaries, effects and storage keys.
        ConversationModule.apply(ctx);
        SettingsModule.apply(ctx);
        RestartModule.apply(ctx);

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'dsh-coolme-toolkit-base-style',
          order: 899,
        }, ToolkitBaseStyle));

        const t = ctx.locale.bind(NS);

        const conversationT = ctx.locale.bind(ConversationModule.NS);
        const settingsT = ctx.locale.bind(SettingsModule.NS);
        const restartT = ctx.locale.bind(RestartModule.NS);

        function ToolkitPage() {
          return h('div', { className: 'dscmtk-page' },
            h('div', { className: 'dscmtk-container' },
              h('header', { className: 'dscmtk-header' },
                h('h1', { className: 'dscmtk-title' }, t('title')),
                h('p', { className: 'dscmtk-description' }, t('description'))),
              h('section', { className: 'dscmtk-card' },
                h(ConversationModule.WidthGroup, { t: conversationT })),
              h('section', { className: 'dscmtk-card' },
                h(SettingsModule.SizeGroup, { t: settingsT })),
              h(RestartModule.RestartGroup, { t: restartT })));
        }

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: NAV_ID,
          locale: NS,
        }, ToolkitPage));

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: NAV_ID,
          order: 40,
          label: () => t('title'),
          locale: NS,
        }, ToolkitIcon));
      },
    };
  },
});
