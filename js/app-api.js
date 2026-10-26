// Gemeinsame App-Schnittstelle (wird von app.js befüllt; vermeidet zirkuläre Importe)
export const A = {
  nav: () => { },
  render: () => { },
  route: { name: 'start', parts: [] },
  openTask: () => { },
  openEvent: () => { },
  newTask: () => { },
  newEvent: () => { },
  toggleDone: () => { },
  startFocus: () => { },
  theme: () => 'light',
  area: () => 'all',
  setArea: () => { },
  now: () => new Date(),
};
