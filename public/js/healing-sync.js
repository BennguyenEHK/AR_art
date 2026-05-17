(function() {
  'use strict';

  let _realtime = null;
  let _channel = null;
  let _state = { percent: 0, userCount: 0, phase: 'healing' };
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

  async function checkLeadership() {
    if (!_channel) return;
    try {
      const members = await _channel.presence.get();
      members.sort((a, b) => a.clientId.localeCompare(b.clientId));
      const wasLeader = _isLeader;
      _isLeader = members.length > 0 && members[0].clientId === _clientId;
      _state.userCount = members.length;
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
      const effective = Math.min(_state.userCount, MAX_USERS);
      // (b) Decay when nobody present; increase when users are here
      if (effective <= 0) {
        _state.percent = Math.max(0, _state.percent - PER_USER_RATE * dt);
      } else {
        _state.percent = Math.min(100, _state.percent + effective * PER_USER_RATE * dt);
      }
      _channel.publish('healing-state', {
        percent: _state.percent,
        userCount: _state.userCount,
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
      detail: { percent: _state.percent, userCount: _state.userCount }
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
    _state.userCount = 1;
    const interval = setInterval(() => {
      if (_state.percent >= 100) { clearInterval(interval); if (!_healingComplete) triggerComplete(); return; }
      _state.percent = Math.min(100, _state.percent + PER_USER_RATE);
      emitUpdate();
    }, 1000);
  }

  window.HealingSync = {
    async init() {
      const config = await fetchConfig();
      if (!config.ablyEnabled || !config.ablyKey) { runLocalFallback(); return; }

      _clientId = generateClientId();
      _realtime = new Ably.Realtime({ key: config.ablyKey, clientId: _clientId });
      _channel = _realtime.channels.get(config.channelName, { params: { rewind: '1' } });

      // Sync healing state from leader (or from rewind on first join)
      _channel.subscribe('healing-state', (msg) => {
        if (!msg.data) return;
        const { percent, userCount, t } = msg.data;
        const staleSec = t ? (Date.now() - t) / 1000 : 0;

        if (staleSec > 3) {
          // (b) Stale message means no leader was ticking — apply retroactive decay
          _state.percent = applyRetroactiveDecay(percent, t);
        } else {
          // Fresh: take max to handle out-of-order delivery
          if (percent > _state.percent) _state.percent = percent;
          if (userCount !== undefined) _state.userCount = userCount;
        }

        emitUpdate();
        if (_state.percent >= 100 && !_healingComplete) triggerComplete();
      });

      // (a) All clients reload when a reset is broadcast
      _channel.subscribe('healing-reset', () => {
        setTimeout(() => window.location.reload(), 600);
      });

      await _channel.presence.enter({ joinedAt: Date.now() });
      _channel.presence.subscribe(() => checkLeadership());
      await checkLeadership();

      // (b) Abandonment marker: last user leaving publishes userCount=0 + timestamp
      // so the next visitor can compute retroactive decay via rewind
      window.addEventListener('beforeunload', () => {
        if (_isLeader && _state.userCount <= 1 && _state.phase === 'healing') {
          try {
            _channel.publish('healing-state', {
              percent: _state.percent,
              userCount: 0,
              t: Date.now()
            });
          } catch(_e) {}
        }
      });
    },

    getState() { return { ..._state }; },

    // (a) Broadcast reset to all connected clients then reload
    reset() {
      if (_channel) {
        _channel.publish('healing-reset', { t: Date.now() });
        _channel.publish('healing-state', { percent: 0, userCount: _state.userCount, t: Date.now() });
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
