/**
 * Client half of the dsh-conversation-width bundle.
 *
 * The transcript column is sized by `--dsh-chat-content-width`, which the
 * Conversation body declares as
 * `var(--dsh-chat-user-width, clamp(680px, column * .64, 920px))`. Everything
 * that must line up with it — the user bubble stack, wide tables, the
 * "jump to bottom" button and the composer card — derives from that one value.
 *
 * The shipped drag handles write an absolute px `--dsh-chat-user-width` onto
 * the body's *parent*. A declaration on the body element itself therefore wins
 * over that inherited value without `!important`, and keeps the composer
 * aligned because the body computes its composer width from the same value.
 *
 * 64% is the app's own default percentage, so leaving the slider there emits
 * nothing at all and keeps the shipped `680–920px` clamp; moving it hands the
 * axis to the percentage and the clamp is released.
 *
 * The row is the settings-section slider recipe used by the Catppuccin glass
 * group: a 92px label, a native `range` input coloured by `accent-color`, and a
 * 56px number box with its unit beside it.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-conversation-width',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'dsh-conversation-width';
    const PKG = '@local/dsh-conversation-width';
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

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
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

        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item',
          id: 'dsh-conversation-width',
          order: 17,
          locale: NS,
        }, WidthGroup));
      },
    };
  },
});
