(function() {
  'use strict';

  let _realtime = null;
  let _channel = null;
  // userCount   = total presence members on /ar (drives SOULS bar)
  // placedCount = members with data.placed === true (drives healing rate)
  let _state = { percent: 0, userCount: 0, placedCount: 0, phase: 'healing' };
  let _clientId = null;
  let _isLeader = false;
  let _leaderInterval = null;
  let _lastTick = Date.now();
  let _healingComplete = false;
  const PER_USER_RATE = 100 / 420;
  const MAX_USERS = 25;

  async function fetchConfig() {
    try {
      const res = await fetch('/api/ar-config');
      return await res.json();
    } catch {
      return { ablyKey: '', channelName: 'ar-art:peace-board:v1', ablyEnabled: false };
    }
  }

  function generateClientId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'client-' + Math.random().toString(36).slice(2, 10);
  }

  // Stable clientId across reloads within the same browser session.
  // Without this, every visit generated a fresh UUID, so a user who
  // returned to /ar within Ably's 15-second presence timeout window
  // appeared as TWO members (the timing-out ghost + the new connection),
  // causing the SOULS bar to over-count on rejoin.
  function getStableClientId() {
    try {
      var existing = sessionStorage.getItem('ar-art-clientId');
      if (existing) { return existing; }
      var fresh = generateClientId();
      sessionStorage.setItem('ar-art-clientId', fresh);
      return fresh;
    } catch (_e) {
      return generateClientId();
    }
  }

  // Explicit Ably presence.leave() on exit. Without this, navigation
  // away (e.g. tapping the "return" link) leaves the user as a "ghost"
  // in presence for ~15 seconds (Ably's default heartbeat timeout), so
  // the SOULS bar on other clients doesn't decrement. Hooked to both
  // beforeunload (desktop) and pagehide (mobile).
  function leavePresenceGracefully() {
    if (!_channel) { return; }
    try { _channel.presence.leave(); } catch (_e) {}
  }

  async function checkLeadership() {
    if (!_channel) return;
    try {
      const members = await _channel.presence.get();
      members.sort((a, b) => a.clientId.localeCompare(b.clientId));
      const wasLeader = _isLeader;
      _isLeader = members.length > 0 && members[0].clientId === _clientId;
      // SOULS bar counts everyone present on /ar (lurkers included).
      _state.userCount = members.length;
      // Healing rate counts only users who have placed their witness
      // (presence.data.placed === true). Lurkers on the page do not contribute.
      _state.placedCount = members.filter(m => m.data && m.data.placed === true).length;
      if (_isLeader && !wasLeader) startLeaderTick();
      if (!_isLeader && wasLeader) stopLeaderTick();
    } catch {}
  }

  function startLeaderTick() {
    stopLeaderTick();
    _lastTick = Date.now();
    _leaderInterval = setInterval(() => {
      if (_state.phase !== 'healing') return;
      const now = Date.now();
      const dt = (now - _lastTick) / 1000;
      _lastTick = now;
      // Rate is driven by placed users only — lurkers don't progress the bar.
      const effective = Math.min(_state.placedCount, MAX_USERS);
      // (b) Decay when nobody placed; increase when placed users are here
      if (effective <= 0) {
        _state.percent = Math.max(0, _state.percent - PER_USER_RATE * dt);
      } else {
        _state.percent = Math.min(100, _state.percent + effective * PER_USER_RATE * dt);
      }
      _channel.publish('healing-state', {
        percent: _state.percent,
        userCount: _state.userCount,
        placedCount: _state.placedCount,
        t: Date.now()
      });
      emitUpdate();
      if (_state.percent >= 100 && !_healingComplete) triggerComplete();
    }, 1000);
  }

  function stopLeaderTick() {
    if (_leaderInterval) { clearInterval(_leaderInterval); _leaderInterval = null; }
  }

  function emitUpdate() {
    document.dispatchEvent(new CustomEvent('healing-update', {
      detail: {
        percent: _state.percent,
        userCount: _state.userCount,
        placedCount: _state.placedCount
      }
    }));
  }

  function triggerComplete() {
    _healingComplete = true;
    _state.phase = 'complete';
    stopLeaderTick();
    document.dispatchEvent(new CustomEvent('healing-complete'));
  }

  // (b) Calculate retroactive decay for state published when no leader was ticking.
  // 2 s grace period covers the 1 s tick interval + network latency.
  function applyRetroactiveDecay(percent, t) {
    if (!t) return percent;
    const idleSec = Math.max(0, (Date.now() - t) / 1000 - 2);
    return idleSec > 0 ? Math.max(0, percent - PER_USER_RATE * idleSec) : percent;
  }

  function runLocalFallback() {
    // Local-only mode: the single user IS on /ar, so SOULS shows 1 immediately.
    // placedCount stays at 0 until notifyPlaced() flips it — that gates the rate.
    _state.userCount = 1;
    _state.placedCount = 0;
    const interval = setInterval(() => {
      if (_state.percent >= 100) { clearInterval(interval); if (!_healingComplete) triggerComplete(); return; }
      if (_state.placedCount > 0) {
        _state.percent = Math.min(100, _state.percent + PER_USER_RATE * _state.placedCount);
      }
      emitUpdate();
    }, 1000);
  }

  window.HealingSync = {
    async init() {
      const config = await fetchConfig();
      if (!config.ablyEnabled || !config.ablyKey) { runLocalFallback(); return; }

      _clientId = getStableClientId();
      _realtime = new Ably.Realtime({ key: config.ablyKey, clientId: _clientId });
      _channel = _realtime.channels.get(config.channelName, { params: { rewind: '1' } });

      // Sync healing state from leader (or from rewind on first join)
      _channel.subscribe('healing-state', (msg) => {
        if (!msg.data) return;
        const { percent, userCount, placedCount, t } = msg.data;
        const staleSec = t ? (Date.now() - t) / 1000 : 0;

        if (staleSec > 3) {
          // (b) Stale message means no leader was ticking — apply retroactive decay
          _state.percent = applyRetroactiveDecay(percent, t);
        } else {
          // Fresh: take max to handle out-of-order delivery
          if (percent > _state.percent) _state.percent = percent;
          if (userCount !== undefined) _state.userCount = userCount;
          if (placedCount !== undefined) _state.placedCount = placedCount;
        }

        emitUpdate();
        if (_state.percent >= 100 && !_healingComplete) triggerComplete();
      });

      // (a) All clients reload when a reset is broadcast
      _channel.subscribe('healing-reset', () => {
        setTimeout(() => window.location.reload(), 600);
      });

      // NOTE: placement-state channel intentionally removed. Each user
      // places their OWN witness independently — model position is local
      // to each device's SLAM frame. Cross-user sync is limited to the
      // presence.data.placed flag, which gates the healing rate only.

      await _channel.presence.enter({ joinedAt: Date.now(), placed: false });
      _channel.presence.subscribe(() => checkLeadership());
      await checkLeadership();

      // Eager presence cleanup on actual exit signals. beforeunload alone
      // is unreliable on mobile — iOS Safari + Android Chrome often don't
      // fire it for link navigation. pagehide IS reliably fired on real
      // navigation away on both platforms.
      function exitHandler() {
        // (b) Abandonment marker: last user leaving publishes userCount=0
        // so the next visitor can compute retroactive decay via rewind.
        if (_isLeader && _state.userCount <= 1 && _state.phase === 'healing') {
          try {
            _channel.publish('healing-state', {
              percent: _state.percent,
              userCount: 0,
              placedCount: 0,
              t: Date.now()
            });
          } catch(_e) {}
        }
        // Explicit leave drops this client from presence immediately so
        // other clients' SOULS bar decrements without waiting for the
        // 15-second Ably heartbeat timeout.
        leavePresenceGracefully();
      }
      window.addEventListener('beforeunload', exitHandler);
      window.addEventListener('pagehide', exitHandler);
    },

    getState() { return { ..._state }; },

    notifyPlaced: function() {
      if (_channel) {
        // Mark this client as placed in presence so the leader counts it
        // toward the healing rate. NO placement-state channel message —
        // model position is local to each device, never propagated.
        _channel.presence.update({ joinedAt: Date.now(), placed: true });
      } else {
        // Local fallback (Ably disabled): this single user now contributes to the rate.
        // userCount was already 1 (user is on /ar); placedCount flips to 1 here.
        _state.placedCount = 1;
        emitUpdate();
      }
    },

    // (a) Broadcast reset to all connected clients then reload
    reset() {
      if (_channel) {
        _channel.publish('healing-reset', { t: Date.now() });
        _channel.publish('healing-state', {
          percent: 0,
          userCount: _state.userCount,
          placedCount: _state.placedCount,
          t: Date.now()
        });
      }
      setTimeout(() => window.location.reload(), 400);
    },

    destroy() {
      stopLeaderTick();
      if (_channel) { _channel.presence.leave(); _channel.unsubscribe(); }
      if (_realtime) _realtime.close();
    }
  };
})();
