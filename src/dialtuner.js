// A panel of sliders on a config object's own dials (the sandbox's camera feel, camtuner.js; its deflect feel, deflecttuner.js):
// changed live (the game reads the object as it runs, so a dial moved is felt at once), kept in this browser, and copied out as
// JSON so that a setting the player likes can be written back into the code as its default.

const read = (path, spec) => path.split('.').reduce((at, key) => at[key], spec);
function write(path, value, spec) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((at, key) => at[key], spec)[last] = value;
}

/**
 * A tuner on `spec` (the config object) for `dials` ([{ path, min, max, step, label, hint }]), kept under `storeKey`:
 * { defaults, apply(values, onto), values(changedOnly, from), mount(host, note) }. The defaults are the object's as the page loaded.
 */
export function createDialTuner(spec, dials, storeKey) {
  const defaults = Object.fromEntries(dials.map((dial) => [dial.path, read(dial.path, spec)]));
  /** Set the dials in `values` ({ path: number }, unknown paths and values out of range ignored). */
  const apply = (values, onto = spec) => {
    for (const dial of dials) {
      const value = Number(values?.[dial.path]);
      if (Number.isFinite(value)) write(dial.path, Math.min(dial.max, Math.max(dial.min, value)), onto);
    }
  };
  /** The dials now, as { path: number } (only those changed from the defaults if `changedOnly`). */
  const values = (changedOnly = false, from = spec) => {
    const out = {};
    for (const dial of dials) {
      const value = read(dial.path, from);
      if (!changedOnly || Math.abs(value - defaults[dial.path]) > 1e-9) out[dial.path] = value;
    }
    return out;
  };
  const loadStored = () => {
    try {
      return JSON.parse(localStorage.getItem(storeKey) ?? 'null');
    } catch {
      return null;
    }
  };
  const store = () => {
    try {
      localStorage.setItem(storeKey, JSON.stringify(values(true)));
    } catch {
      // (Storage refused: the dials still hold for this visit.)
    }
  };
  /** The panel, built into `host` (a DOM element) with `note` over it; the dials kept in this browser are applied first. */
  const mount = (host, note) => {
    apply(loadStored());
    host.replaceChildren();
    const words = document.createElement('p');
    words.className = 'camtune-note';
    words.textContent = note;
    host.append(words);
    const outputs = [];
    const code = Object.assign(document.createElement('textarea'), { className: 'camtune-code', rows: 3, readOnly: true });
    const showCode = () => {
      code.value = JSON.stringify(values(true));
    };
    for (const dial of dials) {
      const row = document.createElement('label');
      row.className = 'camtune-row';
      row.title = dial.hint;
      const name = document.createElement('span');
      name.textContent = dial.label;
      const slider = Object.assign(document.createElement('input'), { type: 'range', min: dial.min, max: dial.max, step: dial.step });
      const shown = document.createElement('output');
      const sync = () => {
        const value = read(dial.path, spec);
        slider.value = value;
        shown.textContent = Number(value.toFixed(3)).toString();
        shown.classList.toggle('changed', Math.abs(value - defaults[dial.path]) > 1e-9);
      };
      slider.addEventListener('input', () => {
        write(dial.path, Number(slider.value), spec);
        sync();
        showCode();
        store();
      });
      outputs.push(sync);
      sync();
      row.append(name, slider, shown);
      host.append(row);
    }
    const actions = document.createElement('div');
    actions.className = 'camtune-actions';
    const copy = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Copy values' });
    copy.addEventListener('click', () => {
      showCode();
      const done = () => {
        copy.textContent = 'Copied';
        setTimeout(() => (copy.textContent = 'Copy values'), 1500);
      };
      navigator.clipboard?.writeText(code.value).then(done, () => code.select()) ?? code.select();
    });
    const reset = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Reset to defaults' });
    reset.addEventListener('click', () => {
      apply(defaults);
      for (const sync of outputs) sync();
      showCode();
      store();
    });
    actions.append(copy, reset);
    host.append(code, actions);
    showCode();
  };
  return { defaults, apply, values, mount };
}
