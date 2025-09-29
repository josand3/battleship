// Battleship - Vanilla JS
// Features: 10x10 boards, 5 ships, drag-to-place, click-to-rotate, AI placement, turn-based attacks,
// random AI with simple hunt/target logic, visual feedback for hits/misses/sunk, win/loss detection.

(function () {
  const BOARD_SIZE = 10;
  const SHIPS_DEF = [
    { key: 'carrier', name: 'Carrier', size: 5 },
    { key: 'battleship', name: 'Battleship', size: 4 },
    { key: 'cruiser', name: 'Cruiser', size: 3 },
    { key: 'submarine', name: 'Submarine', size: 3 },
    { key: 'destroyer', name: 'Destroyer', size: 2 },
  ];

  const els = {
    playerBoard: document.getElementById('playerBoard'),
    aiBoard: document.getElementById('aiBoard'),
    shipyard: document.getElementById('shipyard'),
    status: document.getElementById('status'),
    rotateBtn: document.getElementById('rotateBtn'),
    randomizeBtn: document.getElementById('randomizeBtn'),
    startBtn: document.getElementById('startBtn'),
    resetBtn: document.getElementById('resetBtn'),
  };

  // Game State
  const state = {
    phase: 'placement', // 'placement' | 'battle' | 'gameover'
    orientation: 'H', // 'H' or 'V'
    selectedShip: null,
    player: initPlayerState(),
    ai: initPlayerState(),
    dragging: null, // { shipKey, size, from: 'shipyard'|'board', cells: [{x,y}], offset: {dx,dy} }
    hover: null, // { x, y, cells[], valid }
    aiTargetQueue: [], // cells to try after a hit
    aiTried: new Set(),
    winner: null,
  };

  function initPlayerState() {
    return {
      // board: 2D array of cells
      // Each cell: { hasShip: false, shipKey: null, hit: false, miss: false, sunk: false }
      board: Array.from({ length: BOARD_SIZE }, () =>
        Array.from({ length: BOARD_SIZE }, () => ({ hasShip: false, shipKey: null, hit: false, miss: false, sunk: false }))
      ),
      ships: SHIPS_DEF.map(s => ({ key: s.key, name: s.name, size: s.size, placed: false, hits: 0, cells: [] })),
    };
  }

  // Build boards
  function buildBoard(el, type) {
    el.innerHTML = '';
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const cell = document.createElement('div');
        cell.className = 'cell water';
        cell.dataset.x = String(x);
        cell.dataset.y = String(y);
        cell.dataset.board = type; // 'player' | 'ai'
        el.appendChild(cell);
      }
    }
  }

  buildBoard(els.playerBoard, 'player');
  buildBoard(els.aiBoard, 'ai');

  // Build shipyard
  function buildShipyard() {
    els.shipyard.innerHTML = '';
    for (const ship of SHIPS_DEF) {
      const item = document.createElement('div');
      item.className = 'ship-item';
      item.draggable = false; // custom drag
      item.dataset.shipKey = ship.key;
      item.dataset.size = String(ship.size);
      item.title = `${ship.name} (${ship.size}) - drag to board, click to rotate`;

      for (let i = 0; i < ship.size; i++) {
        const seg = document.createElement('div');
        seg.className = 'ship-cell';
        item.appendChild(seg);
      }
      const label = document.createElement('span');
      label.className = 'ship-label';
      label.textContent = `${ship.name} (${ship.size})`;
      item.appendChild(label);

      item.addEventListener('mousedown', (e) => {
        if (state.phase !== 'placement') return;
        const ps = state.player.ships.find(s => s.key === ship.key);
        if (ps.placed) return;
        startDraggingFromShipyard(e, ship);
      });

      item.addEventListener('touchstart', (e) => {
        if (state.phase !== 'placement') return;
        const ps = state.player.ships.find(s => s.key === ship.key);
        if (ps.placed) return;
        e.preventDefault();
        selectShip(ship);
      }, { passive: false });

      item.addEventListener('click', (e) => {
        if (state.phase !== 'placement') return;
        const ps = state.player.ships.find(s => s.key === ship.key);
        if (ps.placed) return;
        e.preventDefault();
        selectShip(ship);
      });

      els.shipyard.appendChild(item);
    }
  }

  buildShipyard();

  function selectShip(ship) {
    state.selectedShip = { key: ship.key, name: ship.name, size: ship.size };
    updateShipyardVisuals();
    updateStatus(`Selected ${ship.name} (${ship.size} cells). Orientation: ${state.orientation === 'H' ? 'Horizontal' : 'Vertical'}. Tap a cell on your board to place.`);
  }

  function updateShipyardVisuals() {
    const items = els.shipyard.querySelectorAll('.ship-item');
    items.forEach(item => {
      const shipKey = item.dataset.shipKey;
      if (state.selectedShip && shipKey === state.selectedShip.key) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });
  }

  function toggleOrientation() {
    state.orientation = state.orientation === 'H' ? 'V' : 'H';
    if (state.selectedShip) {
      updateStatus(`Selected ${state.selectedShip.name} (${state.selectedShip.size} cells). Orientation: ${state.orientation === 'H' ? 'Horizontal' : 'Vertical'}. Tap a cell on your board to place.`);
    } else {
      updateStatus();
    }
    updateHoverPreview();
  }

  els.rotateBtn.addEventListener('click', toggleOrientation);
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r') toggleOrientation();
  });

  els.randomizeBtn.addEventListener('click', () => {
    if (state.phase !== 'placement') return;
    resetBoard(state.player, false);
    randomizeShips(state.player);
    refreshBoards();
    checkReadyToStart();
    updateStatus('Ships randomized successfully!', true);
  });

  els.startBtn.addEventListener('click', () => {
    if (state.phase !== 'placement') return;
    if (!allShipsPlaced(state.player)) return;
    // AI place
    resetBoard(state.ai, false);
    randomizeShips(state.ai);
    state.phase = 'battle';
    els.aiBoard.classList.remove('disabled');
    updateStatus('Battle started! Your turn. Click a cell on Enemy Waters.');
    refreshBoards();
  });

  els.resetBtn.addEventListener('click', () => {
    resetAll();
  });

  function resetAll() {
    state.phase = 'placement';
    state.orientation = 'H';
    state.selectedShip = null;
    state.player = initPlayerState();
    state.ai = initPlayerState();
    state.dragging = null;
    state.hover = null;
    state.aiTargetQueue = [];
    state.aiTried = new Set();
    state.winner = null;
    els.aiBoard.classList.add('disabled');
    els.startBtn.disabled = true;
    buildShipyard();
    refreshBoards();
    updateStatus('Place your ships by tapping them in the shipyard, then tapping cells on your board. Use Rotate button or press R to change orientation.');
    clearSavedGame();
  }

  function resetBoard(player, clearShipsToo) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        player.board[y][x] = { hasShip: false, shipKey: null, hit: false, miss: false, sunk: false };
      }
    }
    if (clearShipsToo) {
      for (const s of player.ships) {
        s.placed = false; s.hits = 0; s.cells = [];
      }
    } else {
      for (const s of player.ships) { s.placed = false; s.hits = 0; s.cells = []; }
    }
  }

  function allShipsPlaced(player) {
    return player.ships.every(s => s.placed);
  }

  let statusTimeout = null;
  
  function updateStatus(text, autoDismiss = false) {
    if (statusTimeout) {
      clearTimeout(statusTimeout);
      statusTimeout = null;
    }
    
    if (text) {
      els.status.textContent = text;
      if (autoDismiss || text.includes('Invalid') || text.includes('Cannot')) {
        statusTimeout = setTimeout(() => {
          updateStatus();
        }, 4000);
      }
    } else {
      if (state.phase === 'placement') {
        els.status.textContent = `Orientation: ${state.orientation === 'H' ? 'Horizontal' : 'Vertical'} — Tap ships in shipyard, then tap board to place. Use Rotate button or press R.`;
      } else if (state.phase === 'battle') {
        els.status.textContent = 'Battle in progress. Your turn to attack the Enemy Waters.';
      } else if (state.phase === 'gameover') {
        els.status.textContent = state.winner === 'player' ? 'You win! 🎉 Click Reset to play again.' : 'You lost! 💥 Click Reset to try again.';
      }
    }
  }

  // Drag from shipyard to board (custom)
  function startDraggingFromShipyard(e, ship) {
    e.preventDefault();
    state.dragging = { shipKey: ship.key, size: ship.size, from: 'shipyard', cells: [], offset: { dx: 0, dy: 0 } };
    document.body.classList.add('dragging');
  }

  // Hover preview on player board during placement
  els.playerBoard.addEventListener('mousemove', (e) => {
    if (state.phase !== 'placement') return;
    if (!state.dragging) return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains('cell')) return;
    const x = Number(target.dataset.x);
    const y = Number(target.dataset.y);

    const ship = SHIPS_DEF.find(s => s.key === state.dragging.shipKey);
    if (!ship) return;

    const cells = projectShipCells(x, y, ship.size, state.orientation);
    const valid = canPlace(state.player, cells);
    state.hover = { x, y, cells, valid };
    updateHoverPreview();
  });

  els.playerBoard.addEventListener('mouseleave', () => {
    state.hover = null;
    updateHoverPreview();
  });

  els.playerBoard.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Prevent scrolling and default touch behavior
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: true,
      cancelable: true
    });
    els.playerBoard.dispatchEvent(mouseEvent);
  }, { passive: false });

  els.playerBoard.addEventListener('touchmove', (e) => {
    e.preventDefault(); // Prevent scrolling
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: true,
      cancelable: true
    });
    els.playerBoard.dispatchEvent(mouseEvent);
  }, { passive: false });

  els.playerBoard.addEventListener('touchend', (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const mouseEvent = new MouseEvent('mouseup', {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: true,
      cancelable: true
    });
    els.playerBoard.dispatchEvent(mouseEvent);
  }, { passive: false });

  // Place ship on click (or mouseup) when dragging
  els.playerBoard.addEventListener('mouseup', (e) => {
    if (state.phase !== 'placement') return;
    if (!state.dragging) return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains('cell')) return;
    const x = Number(target.dataset.x);
    const y = Number(target.dataset.y);

    const ship = SHIPS_DEF.find(s => s.key === state.dragging.shipKey);
    if (!ship) return;

    const cells = projectShipCells(x, y, ship.size, state.orientation);
    if (!canPlace(state.player, cells)) {
      updateStatus('Invalid placement. Ships must stay on-grid and not touch others.', true);
      return endDrag();
    }
    placeShip(state.player, ship.key, cells);
    refreshBoards();
    checkReadyToStart();
    autoSave(); // Auto-save after ship placement
    endDrag();
  });

  document.addEventListener('mouseup', () => {
    // cancel drag if released outside board
    if (state.dragging && state.phase === 'placement') {
      endDrag();
    }
  });

  function endDrag() {
    state.dragging = null;
    state.hover = null;
    document.body.classList.remove('dragging');
    updateHoverPreview();
  }

  function checkReadyToStart() {
    els.startBtn.disabled = !allShipsPlaced(state.player);
  }

  function projectShipCells(x, y, size, orientation) {
    const cells = [];
    for (let i = 0; i < size; i++) {
      const cx = orientation === 'H' ? x + i : x;
      const cy = orientation === 'H' ? y : y + i;
      cells.push({ x: cx, y: cy });
    }
    return cells;
  }

  function canPlace(player, cells) {
    // on-grid and no overlap, also no adjacent ships (including diagonals)
    for (const { x, y } of cells) {
      if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return false;
      if (player.board[y][x].hasShip) return false;
      // check adjacency around cell
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= BOARD_SIZE || ny >= BOARD_SIZE) continue;
          // If adjacency cell belongs to same projected cells, allow; otherwise block if hasShip
          const inProjected = cells.some(c => c.x === nx && c.y === ny);
          if (!inProjected && player.board[ny][nx].hasShip) return false;
        }
      }
    }
    return true;
  }

  function placeShip(player, shipKey, cells) {
    const s = player.ships.find(sh => sh.key === shipKey);
    if (!s) return false;
    s.placed = true;
    s.cells = cells.map(c => ({ x: c.x, y: c.y }));
    for (const { x, y } of cells) {
      player.board[y][x].hasShip = true;
      player.board[y][x].shipKey = shipKey;
    }
    // disable shipyard item
    const item = els.shipyard.querySelector(`[data-ship-key="${shipKey}"]`);
    if (item) item.style.opacity = '0.45';
    return true;
  }

  els.playerBoard.addEventListener('click', (e) => {
    if (state.phase !== 'placement') return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains('cell')) return;
    const x = Number(target.dataset.x);
    const y = Number(target.dataset.y);
    const cell = state.player.board[y][x];

    if (state.selectedShip && !cell.hasShip) {
      const cells = projectShipCells(x, y, state.selectedShip.size, state.orientation);
      if (!canPlace(state.player, cells)) {
        updateStatus('Invalid placement. Ships must stay on-grid and not touch others.', true);
        return;
      }
      placeShip(state.player, state.selectedShip.key, cells);
      state.selectedShip = null;
      updateShipyardVisuals();
      refreshBoards();
      checkReadyToStart();
      autoSave();
      
      const nextShip = SHIPS_DEF.find(s => {
        const ps = state.player.ships.find(ps => ps.key === s.key);
        return ps && !ps.placed;
      });
      if (nextShip) {
        selectShip(nextShip);
      } else {
        updateStatus('All ships placed! Click Start Game when ready.');
      }
      return;
    }

    if (cell.hasShip) {
      const ship = state.player.ships.find(s => s.key === cell.shipKey);
      if (!ship || !ship.placed) return;

      const xs = ship.cells.map(c => c.x);
      const ys = ship.cells.map(c => c.y);
      const isHorizontal = new Set(ys).size === 1;

      ship.cells.sort((a, b) => (a.y - b.y) || (a.x - b.x));
      const pivot = ship.cells[0];
      const newOrientation = isHorizontal ? 'V' : 'H';
      const projected = projectShipCells(pivot.x, pivot.y, ship.size, newOrientation);
      
      clearShipCells(state.player, ship);
      const ok = canPlace(state.player, projected);
      if (ok) {
        ship.cells = projected;
        for (const c of projected) {
          state.player.board[c.y][c.x].hasShip = true;
          state.player.board[c.y][c.x].shipKey = ship.key;
        }
      } else {
        for (const c of ship.cells) {
          state.player.board[c.y][c.x].hasShip = true;
          state.player.board[c.y][c.x].shipKey = ship.key;
        }
        updateStatus('Cannot rotate here. Not enough space or adjacent conflict.', true);
      }
      refreshBoards();
    }
  });

  els.playerBoard.addEventListener('touchend', (e) => {
    if (state.phase !== 'placement') return;
    if (!state.selectedShip) return;
    e.preventDefault();
    
    const touch = e.changedTouches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains('cell')) return;
    
    target.click();
  }, { passive: false });

  function clearShipCells(player, ship) {
    for (const { x, y } of ship.cells) {
      const cell = player.board[y][x];
      cell.hasShip = false; cell.shipKey = null;
    }
  }

  // Hover preview painter
  function updateHoverPreview() {
    // clear previews on player board
    forEachBoardCell('player', (cellEl) => {
      cellEl.classList.remove('preview', 'invalid');
    });
    if (state.phase !== 'placement') return;
    if (!state.hover) return;

    const { cells, valid } = state.hover;
    for (const { x, y } of cells) {
      const el = getCellEl('player', x, y);
      if (!el) continue;
      el.classList.add(valid ? 'preview' : 'invalid');
    }
  }

  function forEachBoardCell(boardType, fn) {
    const boardEl = boardType === 'player' ? els.playerBoard : els.aiBoard;
    const children = boardEl.children;
    for (let i = 0; i < children.length; i++) {
      fn(children[i]);
    }
  }

  function getCellEl(boardType, x, y) {
    const boardEl = boardType === 'player' ? els.playerBoard : els.aiBoard;
    const index = y * BOARD_SIZE + x;
    return boardEl.children[index];
  }

  // Refresh boards visuals
  function refreshBoards() {
    // Player board shows ships
    forEachBoardCell('player', (el) => {
      const x = Number(el.dataset.x); const y = Number(el.dataset.y);
      const cell = state.player.board[y][x];
      el.className = 'cell';
      if (cell.sunk) el.classList.add('sunk');
      else if (cell.hit) el.classList.add('hit');
      else if (cell.miss) el.classList.add('miss');
      else if (cell.hasShip) el.classList.add('ship');
      else el.classList.add('water');
    });

    // AI board hides ships
    forEachBoardCell('ai', (el) => {
      const x = Number(el.dataset.x); const y = Number(el.dataset.y);
      const cell = state.ai.board[y][x];
      el.className = 'cell';
      if (cell.sunk) el.classList.add('sunk');
      else if (cell.hit) el.classList.add('hit');
      else if (cell.miss) el.classList.add('miss');
      else el.classList.add('water');
    });

    updateHoverPreview();
  }

  // AI ship placement
  function randomizeShips(player) {
    for (const def of SHIPS_DEF) {
      let placed = false; let guard = 0;
      while (!placed && guard++ < 500) {
        const orientation = Math.random() < 0.5 ? 'H' : 'V';
        const maxX = orientation === 'H' ? BOARD_SIZE - def.size : BOARD_SIZE - 1;
        const maxY = orientation === 'H' ? BOARD_SIZE - 1 : BOARD_SIZE - def.size;
        const x = randInt(0, maxX);
        const y = randInt(0, maxY);
        const cells = projectShipCells(x, y, def.size, orientation);
        if (canPlace(player, cells)) {
          placeShip(player, def.key, cells);
          placed = true;
        }
      }
      if (!placed) {
        // fallback massive reset and retry to avoid infinite loop
        resetBoard(player, true);
        return randomizeShips(player);
      }
    }
  }

  function randInt(min, max) { // inclusive
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Battle: player attacks AI - Fixed race condition to prevent multiple attacks per turn
  els.aiBoard.addEventListener('click', (e) => {
    if (state.phase !== 'battle') return;
    if (els.aiBoard.classList.contains('disabled')) return;
    
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains('cell')) return;
    const x = Number(target.dataset.x);
    const y = Number(target.dataset.y);

    const cell = state.ai.board[y][x];
    if (cell.hit || cell.miss || cell.sunk) return; // already tried

    els.aiBoard.classList.add('disabled');
    
    const wasHit = resolveAttack(state.ai, x, y);
    refreshBoards();
    autoSave();

    if (checkWin(state.ai)) {
      state.phase = 'gameover'; state.winner = 'player';
      updateStatus('You win! 🎉 Click Reset to play again.');
      showCelebration('You Win! 🎉', 'win');
      clearSavedGame();
      return;
    }

    // AI turn after a brief delay - board already disabled above
    updateStatus(wasHit ? 'Hit! Enemy turn…' : 'Miss. Enemy turn…');
    setTimeout(aiTurn, 600);
  });

  function resolveAttack(defender, x, y) {
    const cell = defender.board[y][x];
    if (cell.hasShip) {
      cell.hit = true;
      const ship = defender.ships.find(s => s.key === cell.shipKey);
      if (ship) {
        ship.hits++;
        // push neighbors to AI queue if defender is player (AI logic)
        if (defender === state.player) {
          enqueueNeighbors(x, y);
        }
        if (ship.hits >= ship.size) {
          // mark sunk
          for (const c of ship.cells) {
            defender.board[c.y][c.x].sunk = true;
          }
          if (defender === state.ai) {
            updateStatus(`You sunk the enemy ${ship.name}!`);
          }
        }
      }
      return true;
    } else {
      cell.miss = true;
      return false;
    }
  }

  function checkWin(player) {
    // win if all ships sunk
    return player.ships.every(s => s.placed && s.hits >= s.size);
  }

  // AI simple logic: random shots, but if hit, try neighbors with a small FIFO queue
  function enqueueNeighbors(x, y) {
    const dirs = [ [1,0], [-1,0], [0,1], [0,-1] ];
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= BOARD_SIZE || ny >= BOARD_SIZE) continue;
      const key = `${nx},${ny}`;
      if (!state.aiTried.has(key)) state.aiTargetQueue.push({ x: nx, y: ny });
    }
  }

  function aiTurn() {
    if (state.phase !== 'battle') return;

    let shot = null;
    // Pull from target queue first
    while (state.aiTargetQueue.length) {
      const candidate = state.aiTargetQueue.shift();
      const k = `${candidate.x},${candidate.y}`;
      if (state.aiTried.has(k)) continue;
      shot = candidate; break;
    }

    if (!shot) {
      // random untargeted cell
      let guard = 0;
      do {
        shot = { x: randInt(0, BOARD_SIZE - 1), y: randInt(0, BOARD_SIZE - 1) };
        guard++;
        if (guard > 500) break;
      } while (state.aiTried.has(`${shot.x},${shot.y}`));
    }

    if (!shot) {
      // shouldn't happen
      els.aiBoard.classList.remove('disabled');
      return updateStatus('Your turn. Click a cell on Enemy Waters.');
    }

    const triedKey = `${shot.x},${shot.y}`;
    state.aiTried.add(triedKey);

    const wasHit = resolveAttack(state.player, shot.x, shot.y);
    refreshBoards();
    autoSave(); // Auto-save after AI attack

    if (checkWin(state.player)) {
      state.phase = 'gameover'; state.winner = 'ai';
      updateStatus('You lost! 💥 Click Reset to try again.');
      showCelebration('You Lost! 💥', 'loss');
      clearSavedGame(); // Clear saved game on loss
      return;
    }

    // Give control back to player
    els.aiBoard.classList.remove('disabled');
    updateStatus(wasHit ? 'Enemy hit! Your turn.' : 'Enemy missed. Your turn.');
  }

  function saveGameState() {
    const gameState = {
      phase: state.phase,
      orientation: state.orientation,
      player: state.player,
      ai: state.ai,
      aiTried: Array.from(state.aiTried),
      aiTargetQueue: state.aiTargetQueue,
      winner: state.winner
    };
    localStorage.setItem('battleship-game-state', JSON.stringify(gameState));
  }

  function loadGameState() {
    const saved = localStorage.getItem('battleship-game-state');
    if (!saved) return false;
    
    try {
      const gameState = JSON.parse(saved);
      state.phase = gameState.phase;
      state.orientation = gameState.orientation;
      state.player = gameState.player;
      state.ai = gameState.ai;
      state.aiTried = new Set(gameState.aiTried);
      state.aiTargetQueue = gameState.aiTargetQueue;
      state.winner = gameState.winner;
      return true;
    } catch (e) {
      console.error('Failed to load game state:', e);
      return false;
    }
  }

  function clearSavedGame() {
    localStorage.removeItem('battleship-game-state');
  }

  function autoSave() {
    if (state.phase === 'placement' || state.phase === 'battle') {
      saveGameState();
    }
  }

  function showCelebration(message, type = 'win') {
    const celebration = document.createElement('div');
    celebration.className = `celebration ${type}`;
    celebration.textContent = message;
    document.body.appendChild(celebration);
    
    setTimeout(() => {
      celebration.remove();
    }, 3000);
  }

  function checkForSavedGame() {
    if (loadGameState()) {
      const resume = confirm('A saved game was found. Would you like to resume?');
      if (resume) {
        refreshBoards();
        updateStatus();
        checkReadyToStart();
        if (state.phase === 'battle') {
          els.aiBoard.classList.remove('disabled');
        }
        return true;
      } else {
        clearSavedGame();
      }
    }
    return false;
  }

  // Initial setup
  if (!checkForSavedGame()) {
    refreshBoards();
    updateStatus();
  }
  
  window.debugBattleship = {
    saveGameState,
    loadGameState,
    clearSavedGame,
    autoSave,
    checkForSavedGame
  };
})();
