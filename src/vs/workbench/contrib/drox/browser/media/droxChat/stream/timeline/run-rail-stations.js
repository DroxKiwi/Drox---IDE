/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

// Run rail 1.4 — repliable station blocks (U2).

(function (D) {
	const fn = D.fn;
	const STATION_LABELS = {
		intent: 'Intention',
		read: 'Exploration',
		propose: 'Proposition',
		plan: 'Plan',
		act: 'Exécution',
		verify: 'Vérification',
		answer: 'Réponse',
	};

	if (!D.state.runRailStationCards) {
		D.state.runRailStationCards = new Map();
	}
	if (!D.state.runRailSegmentCards) {
		D.state.runRailSegmentCards = new Map();
	}

	function stationLabel(station, custom) {
		const c = String(custom ?? '').trim();
		if (c) {
			return c;
		}
		return STATION_LABELS[String(station ?? '').trim()] || String(station ?? 'station');
	}

	function mountRailCard(el) {
		const log = document.getElementById('log');
		if (log) {
			log.appendChild(el);
		}
		fn.scrollLog?.();
	}

	fn.renderRailStationEnter = function (payload) {
		const station = String(payload?.station ?? '').trim();
		if (!station) {
			return;
		}
		const label = stationLabel(station, payload?.label);
		const el = document.createElement('details');
		el.className = 'msg-rail-station msg-rail-station-running';
		el.open = true;
		el.dataset.station = station;
		const summary = document.createElement('summary');
		summary.className = 'msg-rail-station-summary';
		summary.textContent = `▶ ${label}`;
		el.appendChild(summary);
		const body = document.createElement('div');
		body.className = 'msg-rail-station-body';
		body.textContent = payload?.taskId ? `task ${payload.taskId}` : '';
		el.appendChild(body);
		D.state.runRailStationCards.set(station, el);
		mountRailCard(el);
	};

	fn.renderRailStationHold = function (payload) {
		const station = String(payload?.station ?? 'propose').trim();
		const el = D.state.runRailStationCards.get(station);
		if (!el) {
			return;
		}
		el.classList.remove('msg-rail-station-running');
		el.classList.add('msg-rail-station-waiting');
		const summary = el.querySelector('.msg-rail-station-summary');
		if (summary) {
			summary.textContent = `⏸ ${stationLabel(station)} — en attente de votre retour`;
		}
	};

	fn.renderRailStationDone = function (payload) {
		const station = String(payload?.station ?? '').trim();
		const el = D.state.runRailStationCards.get(station);
		if (!el) {
			return;
		}
		el.classList.remove('msg-rail-station-running', 'msg-rail-station-waiting');
		el.classList.add('msg-rail-station-done');
		el.open = false;
		const summary = el.querySelector('.msg-rail-station-summary');
		if (summary) {
			summary.textContent = `✓ ${stationLabel(station)}`;
		}
	};

	fn.renderRailSegmentStart = function (payload) {
		const taskId = String(payload?.taskId ?? '').trim();
		if (!taskId) {
			return;
		}
		const act = D.state.runRailStationCards.get('act');
		const el = document.createElement('details');
		el.className = 'msg-rail-segment msg-rail-segment-running';
		el.open = false;
		const summary = document.createElement('summary');
		summary.className = 'msg-rail-segment-summary';
		const scope = Array.isArray(payload?.scope) ? payload.scope.join(', ') : '';
		summary.textContent = `Segment ${taskId}${scope ? ` — ${scope}` : ''}`;
		el.appendChild(summary);
		if (act) {
			const body = act.querySelector('.msg-rail-station-body');
			if (body) {
				body.appendChild(el);
			} else {
				act.appendChild(el);
			}
		} else {
			mountRailCard(el);
		}
		D.state.runRailSegmentCards.set(taskId, el);
	};

	fn.renderRailSegmentDone = function (payload) {
		const taskId = String(payload?.taskId ?? '').trim();
		const el = D.state.runRailSegmentCards.get(taskId);
		if (!el) {
			return;
		}
		el.classList.remove('msg-rail-segment-running');
		el.classList.add('msg-rail-segment-done');
		const status = String(payload?.status ?? 'partial');
		const summary = el.querySelector('.msg-rail-segment-summary');
		if (summary) {
			summary.textContent = `Segment ${taskId} — ${status}`;
		}
		const note = String(payload?.summary ?? '').trim();
		if (note) {
			const body = document.createElement('div');
			body.className = 'msg-rail-segment-body';
			body.textContent = note;
			el.appendChild(body);
		}
	};
})(globalThis.DroxChat);
