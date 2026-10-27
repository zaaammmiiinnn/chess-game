import { useEffect, useRef, useState } from 'react';
import { initWizardChess } from './wizardChessEngine.js';

interface RoomState {
  code: string;
  status: string;
  whiteJoined: boolean;
  blackJoined: boolean;
  whiteName?: string | null;
  blackName?: string | null;
  whiteConnected?: boolean;
  blackConnected?: boolean;
  turn: 'w' | 'b';
  moves: Array<{
    seq: number;
    color: string;
    from: { r: number; c: number };
    to: { r: number; c: number };
  }>;
  resetCount?: number;
}

export default function App() {
  const initializedRef = useRef(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [onlineModalOpen, setOnlineModalOpen] = useState(false);
  const [onlineTab, setOnlineTab] = useState<'create' | 'join'>('create');
  const [createColor, setCreateColor] = useState<'w' | 'b' | 'random'>('w');
  const [playerName, setPlayerName] = useState('Archmage');
  const [joinCode, setJoinCode] = useState('');
  const [activeRoom, setActiveRoom] = useState<RoomState | null>(null);
  const [myColor, setMyColor] = useState<'w' | 'b' | 'spectator'>('w');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [roomDrawerOpen, setRoomDrawerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    initWizardChess();

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setJoinCode(roomParam.toUpperCase());
    }
  }, []);

  useEffect(() => {
    const handleRoomUpdate = (e: Event) => {
      const custom = e as CustomEvent<{
        room: RoomState | null;
        playerColor: 'w' | 'b' | 'spectator';
        roomCode: string | null;
        isSpectator: boolean;
        gameMode: string;
      }>;
      if (custom.detail) {
        setActiveRoom(custom.detail.room);
        setMyColor(custom.detail.playerColor);
        if (custom.detail.room) {
          const both = custom.detail.room.whiteJoined && custom.detail.room.blackJoined;
          setStatusMsg(
            both
              ? `Both wizards joined Sanctum ${custom.detail.room.code}!`
              : `Waiting for opponent to enter Sanctum ${custom.detail.room.code}...`
          );
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileSheetOpen(false);
        setOnlineModalOpen(false);
        setRoomDrawerOpen(false);
      }
    };

    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMobileSheetOpen(false);
      }
    };

    window.addEventListener('wizardChess:roomUpdate', handleRoomUpdate);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('wizardChess:roomUpdate', handleRoomUpdate);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleRestoreUI = () => {
    const win = window as unknown as { wizardChess?: { toggleUI?: (force?: boolean) => void } };
    if (win.wizardChess?.toggleUI) {
      win.wizardChess.toggleUI(false);
    } else {
      document.body.classList.remove('cinematic-ui-hidden');
      const btnHide = document.getElementById('btn-hide-ui');
      if (btnHide) btnHide.textContent = 'Hide UI [H]';
    }
  };

  const handleCreateRoom = async () => {
    const win = window as unknown as {
      wizardChess?: {
        createMultiplayerRoom?: (
          color: string,
          name: string
        ) => Promise<{ ok: boolean; code?: string; color?: string; room?: RoomState }>;
      };
    };
    if (!win.wizardChess?.createMultiplayerRoom) return;

    setIsSubmitting(true);
    setStatusMsg('Summoning sanctum room...');
    try {
      const res = await win.wizardChess.createMultiplayerRoom(createColor, playerName || 'Archmage');
      if (res && res.ok && res.room) {
        setActiveRoom(res.room);
        setMyColor((res.color as 'w' | 'b') || 'w');
        setStatusMsg(`Room ${res.code} created! Share code or link with your friend.`);
      }
    } catch (err) {
      setStatusMsg('Failed to summon room. Retrying local mode...');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinRoom = async (codeToJoin?: string) => {
    const targetCode = String(codeToJoin || joinCode).trim().toUpperCase();
    if (!targetCode) {
      setStatusMsg('Please enter a 6-letter room code.');
      return;
    }

    const win = window as unknown as {
      wizardChess?: {
        joinMultiplayerRoom?: (
          code: string,
          name: string
        ) => Promise<{ ok: boolean; code?: string; color?: string; room?: RoomState; error?: string }>;
      };
    };
    if (!win.wizardChess?.joinMultiplayerRoom) return;

    setIsSubmitting(true);
    setStatusMsg(`Entering Sanctum ${targetCode}...`);
    try {
      const res = await win.wizardChess.joinMultiplayerRoom(targetCode, playerName || 'Challenger');
      if (res && res.ok && res.room) {
        setActiveRoom(res.room);
        setMyColor((res.color as 'w' | 'b' | 'spectator') || 'b');
        setOnlineModalOpen(false);
        setStatusMsg(`Entered Room ${targetCode}!`);
      } else {
        setStatusMsg(res?.error || 'Room not found. Please double-check the code.');
      }
    } catch (err) {
      setStatusMsg('Connection error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCode = () => {
    if (!activeRoom?.code) return;
    navigator.clipboard?.writeText(activeRoom.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2200);
  };

  const handleCopyLink = () => {
    if (!activeRoom?.code) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${activeRoom.code}`;
    navigator.clipboard?.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const handleSendTaunt = (phrase: string) => {
    const win = window as unknown as {
      wizardChess?: { sendMultiplayerChat?: (text: string) => void };
    };
    if (win.wizardChess?.sendMultiplayerChat) {
      win.wizardChess.sendMultiplayerChat(phrase);
    }
  };

  const handleLeaveRoom = () => {
    const win = window as unknown as {
      wizardChess?: { leaveMultiplayerRoom?: () => void };
    };
    if (win.wizardChess?.leaveMultiplayerRoom) {
      win.wizardChess.leaveMultiplayerRoom();
    }
    setActiveRoom(null);
    setRoomDrawerOpen(false);
    setStatusMsg('Returned to Solo Sanctum against AI.');
  };

  const handleRematch = () => {
    const win = window as unknown as {
      wizardChess?: { requestRematch?: () => void };
    };
    if (win.wizardChess?.requestRematch) {
      win.wizardChess.requestRematch();
    }
  };

  const isBothConnected = Boolean(activeRoom?.whiteJoined && activeRoom?.blackJoined);

  return (
    <>
      <div id="loading-overlay">
        <div className="loader-title">Wizard Chess</div>
        <div className="loader-bar-wrap">
          <div className="loader-bar" id="loader-bar"></div>
        </div>
        <div id="loader-text">Summoning Sanctum Architecture &amp; Sculpted Pieces...</div>
      </div>

      <div id="canvas-container"></div>

      <button
        type="button"
        className="hud-btn mobile-only-restore-ui"
        id="btn-mobile-show-ui"
        onClick={handleRestoreUI}
        title="Show HUD Controls"
      >
        Show UI
      </button>

      <div id="hud-top">
        <div className="hud-group" id="hud-left">
          <div className="brand-pill">
            <span className="brand-title">Wizard Chess</span>
          </div>

          <div className="status-pill" id="status-pill">
            <span className="turn-dot" id="turn-dot"></span>
            <span id="turn-text">White to Move</span>
            <span className="mode-badge" id="mode-badge">
              {activeRoom
                ? `Online: ${myColor === 'w' ? 'White' : myColor === 'b' ? 'Black' : 'Spectator'}`
                : 'Playing as White'}
            </span>
          </div>

          {activeRoom && (
            <div
              className="room-pill-active"
              id="online-room-pill"
              onClick={() => setRoomDrawerOpen((prev) => !prev)}
              title="Click for Room Settings &amp; Taunts"
            >
              <span className={`room-dot ${isBothConnected ? 'online' : 'waiting'}`}></span>
              <span>Room: <strong>{activeRoom.code}</strong></span>
              <span className="room-side-tag">
                {myColor === 'w' ? 'White' : myColor === 'b' ? 'Black' : 'Spectator'}
              </span>
              <span className="room-status-badge">
                {isBothConnected ? '2/2 Connected' : 'Waiting...'}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          className={`hud-btn mobile-controls-trigger ${mobileSheetOpen ? 'active' : ''}`}
          id="btn-mobile-controls"
          aria-expanded={mobileSheetOpen}
          aria-controls="hud-right"
          onClick={() => setMobileSheetOpen((prev) => !prev)}
        >
          {mobileSheetOpen ? 'Close' : 'Controls'}
        </button>

        <div
          className={`mobile-sheet-backdrop ${mobileSheetOpen ? 'open' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setMobileSheetOpen(false);
          }}
          aria-hidden="true"
        ></div>

        <div
          className={`hud-group ${mobileSheetOpen ? 'mobile-sheet-open' : ''}`}
          id="hud-right"
        >
          <div
            className="mobile-sheet-handle-wrap"
            onClick={(e) => {
              e.stopPropagation();
              setMobileSheetOpen(false);
            }}
            aria-hidden="true"
          >
            <div className="mobile-sheet-handle"></div>
          </div>

          <div className="mobile-sheet-header">
            <span className="mobile-sheet-title">Controls</span>
            <button
              type="button"
              className="mobile-sheet-close"
              id="btn-mobile-sheet-close"
              onClick={(e) => {
                e.stopPropagation();
                setMobileSheetOpen(false);
              }}
              aria-label="Close Controls"
            >
              Close ✕
            </button>
          </div>

          <div className="mobile-sheet-section-label">Online Multiplayer</div>

          <button
            className="hud-btn primary"
            id="btn-play-online"
            title="Create a room and play online with friends"
            onClick={() => {
              setMobileSheetOpen(false);
              setOnlineModalOpen(true);
            }}
          >
            ⚔ Play Online
          </button>

          <div className="hud-divider" aria-hidden="true"></div>
          <div className="mobile-sheet-section-label">Game Actions</div>

          <button
            className="hud-btn"
            id="btn-side-toggle"
            title="Switch between Playing as White and Playing as Black"
            onClick={() => setMobileSheetOpen(false)}
          >
            Play as Black
          </button>
          <button
            className="hud-btn"
            id="btn-ai-move"
            title="Let the AI make the next move immediately"
            onClick={() => setMobileSheetOpen(false)}
          >
            AI Move
          </button>
          <button
            className="hud-btn"
            id="btn-reset"
            title="Start a fresh game on the altar"
            onClick={() => setMobileSheetOpen(false)}
          >
            New Game
          </button>

          <div className="hud-divider" aria-hidden="true"></div>
          <div className="mobile-sheet-section-label">
            <span>Camera Views</span>
            <span className="mobile-sheet-section-sub">Tap active view to flip</span>
          </div>

          <button
            className="hud-btn active"
            id="btn-cam-player"
            title="Player Camera (Click again to flip White / Black view)"
          >
            Player Cam
          </button>
          <button
            className="hud-btn"
            id="btn-cam-top"
            title="Overhead Board View (Click again to flip White / Black orientation)"
          >
            Overhead
          </button>
          <button
            className="hud-btn"
            id="btn-cam-side"
            title="Side Profile View (Click again to switch East / West side)"
          >
            Side
          </button>
          <button
            className="hud-btn"
            id="btn-cam-wide"
            title="Wide Cathedral View (Click again to switch North Rose / South Narthex)"
          >
            Cathedral
          </button>

          <div className="hud-divider" aria-hidden="true"></div>
          <div className="mobile-sheet-section-label">Display &amp; Gestures</div>

          <button
            className="hud-btn"
            id="btn-hide-ui"
            title="Toggle HUD visibility (Shortcut: H)"
            onClick={() => setMobileSheetOpen(false)}
          >
            Hide UI [H]
          </button>

          <div className="mobile-sheet-hint">
            <strong>Touch:</strong> Tap Piece to Move &nbsp;•&nbsp; 1-Finger Drag: Orbit &nbsp;•&nbsp; 2-Finger Drag: Pan &nbsp;•&nbsp; Pinch: Zoom
          </div>
        </div>
      </div>

      <div id="hud-bottom">
        <div className="hint-pill" id="controls-hint">
          <strong>Controls:</strong> Click Piece to Move &nbsp;•&nbsp; Left-Drag: Orbit &nbsp;•&nbsp; Right-Drag: Pan &nbsp;•&nbsp; Scroll: Zoom &nbsp;•&nbsp; WASD + R/F: Fly Cam &nbsp;•&nbsp; H: Hide UI
        </div>
        <div className="captured-pill" id="captured-tray"></div>
      </div>

      {/* Online Multiplayer Modal */}
      {onlineModalOpen && (
        <div
          className="online-modal-backdrop"
          id="online-room-modal"
          role="dialog"
          aria-modal="true"
          onClick={() => setOnlineModalOpen(false)}
        >
          <div
            className="online-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="online-modal-header">
              <div className="online-modal-title">
                <span>✦</span>
                <span>Sanctum Online Play</span>
              </div>
              <button
                type="button"
                className="online-modal-close"
                onClick={() => setOnlineModalOpen(false)}
                aria-label="Close Modal"
              >
                ✕
              </button>
            </div>

            <div className="online-modal-tabs">
              <button
                type="button"
                className={`online-tab-btn ${onlineTab === 'create' ? 'active' : ''}`}
                onClick={() => setOnlineTab('create')}
              >
                Create Room
              </button>
              <button
                type="button"
                className={`online-tab-btn ${onlineTab === 'join' ? 'active' : ''}`}
                onClick={() => setOnlineTab('join')}
              >
                Join Room
              </button>
            </div>

            {onlineTab === 'create' ? (
              <div>
                <label className="form-label" htmlFor="create-player-name">Your Wizard Title / Name</label>
                <input
                  id="create-player-name"
                  type="text"
                  className="form-input"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="e.g. Archmage Albus"
                  maxLength={24}
                />

                <span className="form-label">Choose Your Altar Side</span>
                <div className="color-picker-grid">
                  <div
                    className={`color-pick-card ${createColor === 'w' ? 'selected' : ''}`}
                    onClick={() => setCreateColor('w')}
                  >
                    <span className="color-pick-icon">♔</span>
                    <span className="color-pick-name">White</span>
                    <span className="color-pick-desc">Moves First • North</span>
                  </div>
                  <div
                    className={`color-pick-card ${createColor === 'b' ? 'selected' : ''}`}
                    onClick={() => setCreateColor('b')}
                  >
                    <span className="color-pick-icon">♚</span>
                    <span className="color-pick-name">Black</span>
                    <span className="color-pick-desc">Moves Second • South</span>
                  </div>
                  <div
                    className={`color-pick-card ${createColor === 'random' ? 'selected' : ''}`}
                    onClick={() => setCreateColor('random')}
                  >
                    <span className="color-pick-icon">⚔</span>
                    <span className="color-pick-name">Random</span>
                    <span className="color-pick-desc">Balanced 50/50 Fate</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="action-btn-primary"
                  id="btn-create-online-room"
                  onClick={handleCreateRoom}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Summoning Room...' : '✦ Summon Room & Play with Friend'}
                </button>

                {activeRoom && (
                  <div className="room-created-box" id="room-created-panel">
                    <div className="room-code-tagline">Sanctum Room Code</div>
                    <div className="big-room-code" id="modal-room-code">{activeRoom.code}</div>

                    <div className="room-actions-row">
                      <button
                        type="button"
                        className="action-btn-secondary"
                        id="btn-copy-code"
                        onClick={handleCopyCode}
                      >
                        {copiedCode ? '✓ Copied Code!' : 'Copy Code'}
                      </button>
                      <button
                        type="button"
                        className="action-btn-secondary"
                        id="btn-copy-link"
                        onClick={handleCopyLink}
                      >
                        {copiedLink ? '✓ Copied Link!' : 'Copy Invite Link'}
                      </button>
                    </div>

                    <div className={`room-live-status ${isBothConnected ? 'ready' : 'waiting'}`}>
                      <span className={`room-dot ${isBothConnected ? 'online' : 'waiting'}`}></span>
                      <span>
                        {isBothConnected
                          ? '✦ Opponent Connected! Ready for battle.'
                          : 'Waiting for friend to enter Sanctum...'}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="action-btn-primary"
                      id="btn-enter-created-room"
                      onClick={() => setOnlineModalOpen(false)}
                    >
                      Enter Altar &amp; Battle
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="form-label" htmlFor="join-player-name">Your Wizard Title / Name</label>
                <input
                  id="join-player-name"
                  type="text"
                  className="form-input"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="e.g. Challenger Harry"
                  maxLength={24}
                />

                <label className="form-label" htmlFor="input-room-code">Room Code</label>
                <input
                  id="input-room-code"
                  type="text"
                  className="form-input code-input"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="SANCTM"
                  maxLength={6}
                  autoComplete="off"
                  autoFocus
                />

                <button
                  type="button"
                  className="action-btn-primary"
                  id="btn-join-online-room"
                  onClick={() => handleJoinRoom()}
                  disabled={isSubmitting || !joinCode.trim()}
                >
                  {isSubmitting ? 'Entering Room...' : '⚔ Enter Sanctum Room'}
                </button>
              </div>
            )}

            {statusMsg && (
              <div
                id="mp-status-msg"
                style={{
                  marginTop: '16px',
                  textAlign: 'center',
                  fontSize: '0.8rem',
                  color: 'var(--gold-bright)'
                }}
              >
                {statusMsg}
              </div>
            )}
          </div>
        </div>
      )}

      {/* In-Game Room Drawer for Quick Taunts, Invite Sharing & Rematch */}
      {roomDrawerOpen && activeRoom && (
        <div className="room-details-drawer" id="room-details-drawer">
          <div className="drawer-header">
            <span className="drawer-title">Sanctum Room: {activeRoom.code}</span>
            <button
              type="button"
              className="online-modal-close"
              style={{ width: '24px', height: '24px', fontSize: '0.75rem' }}
              onClick={() => setRoomDrawerOpen(false)}
            >
              ✕
            </button>
          </div>

          <div className="player-matchup-row">
            <div className="player-side-box">
              <span>♔</span>
              <span>{activeRoom.whiteName || 'White'}</span>
            </div>
            <span style={{ color: 'var(--gold)' }}>VS</span>
            <div className="player-side-box">
              <span>♚</span>
              <span>{activeRoom.blackName || (activeRoom.blackJoined ? 'Black' : 'Waiting...')}</span>
            </div>
          </div>

          <div className="room-actions-row">
            <button
              type="button"
              className="action-btn-secondary"
              onClick={handleCopyCode}
            >
              {copiedCode ? '✓ Copied' : 'Copy Code'}
            </button>
            <button
              type="button"
              className="action-btn-secondary"
              onClick={handleCopyLink}
            >
              {copiedLink ? '✓ Copied' : 'Copy Link'}
            </button>
          </div>

          <span className="form-label" style={{ marginTop: '8px' }}>Send Sanctum Taunts</span>
          <div className="taunts-grid">
            <button type="button" className="taunt-btn" onClick={() => handleSendTaunt('⚔ En garde, wizard!')}>
              ⚔ En garde!
            </button>
            <button type="button" className="taunt-btn" onClick={() => handleSendTaunt('✦ Beware my knights!')}>
              ✦ Beware knights!
            </button>
            <button type="button" className="taunt-btn" onClick={() => handleSendTaunt('👑 Checkmate awaits you!')}>
              👑 Checkmate awaits!
            </button>
            <button type="button" className="taunt-btn" onClick={() => handleSendTaunt('⚡ Magnificent move!')}>
              ⚡ Magnificent move!
            </button>
            <button type="button" className="taunt-btn" onClick={() => handleSendTaunt('🪄 You cannot breach my wall!')}>
              🪄 Iron defense!
            </button>
            <button type="button" className="taunt-btn" onClick={() => handleSendTaunt('♟ Are you prepared to yield?')}>
              ♟ Will you yield?
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button
              type="button"
              className="action-btn-secondary"
              onClick={handleRematch}
              style={{ color: 'var(--gold-bright)' }}
            >
              ✦ Request Rematch
            </button>
            <button
              type="button"
              className="action-btn-secondary"
              onClick={handleLeaveRoom}
              style={{ color: 'var(--danger)' }}
            >
              Leave Room
            </button>
          </div>
        </div>
      )}

      {/* Checkmate Overlay */}
      <div id="checkmate-overlay" role="status" aria-live="polite">
        <div className="checkmate-banner">
          <div className="checkmate-ornament">✦ &nbsp; Sanctum Judgment &nbsp; ✦</div>
          <div className="checkmate-crown" id="checkmate-crown">♔</div>
          <div className="checkmate-title" id="checkmate-title">Checkmate</div>
          <div className="checkmate-rule"></div>
          <div className="checkmate-subtitle" id="checkmate-subtitle">
            White Triumphs • The Black King Has Fallen
          </div>
          <div className="checkmate-actions">
            <button className="checkmate-btn" id="btn-checkmate-replay">
              Replay King Fall
            </button>
            <button className="checkmate-btn" id="btn-checkmate-newgame">
              New Game
            </button>
            <button className="checkmate-btn secondary" id="btn-checkmate-dismiss">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
