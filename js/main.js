'use strict';

(function () {
  Promise.all([
    fetch('js/data/cards.json').then(function (r) { return r.json(); }),
    fetch('js/data/missions.json').then(function (r) { return r.json(); })
  ])
    .then(function (data) {
      UI.init(data[0].cards, data[1].missions);
    })
    .catch(function (err) {
      console.error('failed to load game data:', err);
    });
})();
