// The sound's controls on the page: the speaker button (mute) in a corner of every screen, the Audio section of the settings
// (master, effects, ambience, music and voices, and the Speakers toggle), and the menus' own sounds (a click on a button, a confirm on
// one that starts something, a back). Browser only.

/** The speaker's icon, on or struck through (inline SVG, as the fight UI's icons are). */
export function speakerIcon(muted) {
  const waves = muted
    ? '<path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
    : '<path d="M16 8.5a5 5 0 0 1 0 7M18.8 5.8a9 9 0 0 1 0 12.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor"/>${waves}</svg>`;
}

/** The mute button, fixed in the top right corner of the page over every screen; kept in step with the settings. */
export function installMuteButton(engine, parent = document.body) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'sound-toggle';
  button.className = 'sound-toggle';
  const draw = () => {
    const muted = engine.settings.muted;
    button.innerHTML = speakerIcon(muted);
    button.setAttribute('aria-label', muted ? 'Sound off: turn it on' : 'Sound on: mute it');
    button.title = muted ? 'Sound off (tap to turn on)' : 'Sound on (tap to mute)';
    button.setAttribute('aria-pressed', String(muted));
  };
  button.addEventListener('click', (press) => {
    press.stopPropagation();
    engine.unlock();
    engine.toggleMute();
  });
  engine.onChange(draw);
  draw();
  parent.append(button);
  return button;
}

/** The mixer's sliders, as they are labelled. */
const MIXER_LEVELS = [['master', 'Master'], ['effects', 'Effects'], ['voices', 'Voices'], ['ambience', 'Ambience'], ['music', 'Music']];

/** The Audio section of the settings: a slider for each level and the Speakers toggle, saved as they change. */
export function audioMixer(engine) {
  const section = document.createElement('section');
  section.className = 'audio-mixer';
  section.setAttribute('aria-label', 'Audio');
  const title = document.createElement('h2');
  title.textContent = 'Audio';
  section.append(title);
  for (const [name, label] of MIXER_LEVELS) {
    const row = document.createElement('label');
    row.className = 'mixer-row';
    const words = document.createElement('span');
    words.textContent = label;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '1';
    slider.value = String(Math.round(engine.settings[name] * 100));
    slider.dataset.level = name;
    const value = document.createElement('output');
    value.textContent = `${slider.value}%`;
    slider.addEventListener('input', () => {
      value.textContent = `${slider.value}%`;
      engine.set(name, Number(slider.value) / 100);
    });
    row.append(words, slider, value);
    section.append(row);
  }
  const toggle = document.createElement('label');
  toggle.className = 'mixer-row mixer-toggle';
  const words = document.createElement('span');
  words.textContent = 'Speakers';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = engine.speakers();
  box.dataset.setting = 'speakers';
  const note = document.createElement('em');
  const explain = () => {
    note.textContent = box.checked ? 'Stereo panning; behind sounds duller' : '3-D for headphones: front, back and height';
  };
  explain();
  box.addEventListener('change', () => {
    engine.set('speakers', box.checked);
    explain();
  });
  toggle.append(words, box, note);
  const mute = document.createElement('label');
  mute.className = 'mixer-row mixer-toggle';
  const muteWords = document.createElement('span');
  muteWords.textContent = 'Mute';
  const muteBox = document.createElement('input');
  muteBox.type = 'checkbox';
  muteBox.checked = engine.settings.muted;
  muteBox.dataset.setting = 'muted';
  muteBox.addEventListener('change', () => engine.set('muted', muteBox.checked));
  const forget = engine.onChange(() => {
    muteBox.checked = engine.settings.muted;
    if (!section.isConnected) forget();
  });
  mute.append(muteWords, muteBox, document.createElement('em'));
  section.append(toggle, mute);
  return section;
}

/**
 * The menus' sounds: a click on any button of a menu screen, the side pick, the banner or the builder; a confirm on one that starts
 * something (primary, a big choice, a side); a back on one that goes back. Not the fight's own controls.
 */
export function installUiSounds(engine, root = document) {
  root.addEventListener('click', (press) => {
    const button = press.target.closest?.('button, [role="button"], input[type="checkbox"]');
    if (!button || !button.closest('.screen, .wizard, .side-pick, .banner, .builder, .controls, .sound-bench, .stage-card, .story')) return;
    if (button.closest('.fight-ui')) return;
    const text = button.textContent ?? '';
    const kind = button.classList.contains('back') || text.startsWith('←') ? 'back'
      : button.classList.contains('primary') || button.classList.contains('choice') || button.classList.contains('side') || button.classList.contains('watch') ? 'confirm'
        : 'click';
    engine.ui(kind);
  }, { capture: true });
}
