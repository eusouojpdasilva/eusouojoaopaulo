// Cloudflare Worker — mantém o Supabase ativo (cron) + expõe agenda do Google Calendar (rota /calendar)
// Cron Trigger já configurado: "0 10 */4 * *" (a cada 4 dias, 10h UTC)
// Variáveis necessárias (Settings > Variables and Secrets):
//   SUPABASE_URL   (texto)  https://swiszowpfurkegrnbwfj.supabase.co
//   SUPABASE_KEY   (secret) chave anon do Supabase
//   GCAL_ICS_URL   (secret) endereço secreto iCal do Google Calendar (.ics)

async function pingSupabase(env) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/leads?select=id&limit=1`, {
    headers: {
      apikey: env.SUPABASE_KEY,
      Authorization: `Bearer ${env.SUPABASE_KEY}`,
    },
  });
  return { ok: r.ok, status: r.status, ts: new Date().toISOString() };
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function unfoldICS(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function decodeICSText(s) {
  return s.replace(/\\n/g, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/<[^>]+>/g, '').trim();
}

// Datas do Brasil (America/Bahia, America/Sao_Paulo) não têm horário de verão desde 2019 — offset fixo -03:00
function parseICSDate(value, params) {
  if ((params && params.VALUE === 'DATE') || /^\d{8}$/.test(value)) {
    const y = +value.slice(0, 4), mo = +value.slice(4, 6) - 1, d = +value.slice(6, 8);
    return { date: new Date(Date.UTC(y, mo, d)), allDay: true };
  }
  const y = +value.slice(0, 4), mo = +value.slice(4, 6) - 1, d = +value.slice(6, 8);
  const h = +value.slice(9, 11), mi = +value.slice(11, 13), s = +value.slice(13, 15) || 0;
  if (value.endsWith('Z')) {
    return { date: new Date(Date.UTC(y, mo, d, h, mi, s)), allDay: false };
  }
  return { date: new Date(Date.UTC(y, mo, d, h + 3, mi, s)), allDay: false };
}

function expandRRule(rrule, dtstart, dtend) {
  const duration = dtend.getTime() - dtstart.getTime();
  const parts = {};
  rrule.split(';').forEach(p => { const [k, v] = p.split('='); parts[k] = v; });
  const freq = parts.FREQ;
  const interval = parseInt(parts.INTERVAL || '1');
  const count = parts.COUNT ? parseInt(parts.COUNT) : null;
  const until = parts.UNTIL ? parseICSDate(parts.UNTIL, {}).date : null;
  const byday = parts.BYDAY ? parts.BYDAY.split(',') : null;
  const bymonthday = parts.BYMONTHDAY ? parseInt(parts.BYMONTHDAY) : null;
  const dayMap = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const maxOccurrences = 200;
  const maxWindow = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
  const results = [];

  if (freq === 'WEEKLY' && byday) {
    let weekStart = new Date(dtstart);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    let generated = 0, weekCount = 0;
    while (generated < (count || maxOccurrences) && weekStart < maxWindow) {
      for (const bd of byday) {
        const dow = dayMap[bd];
        if (dow === undefined) continue;
        const occStart = new Date(weekStart);
        occStart.setUTCDate(occStart.getUTCDate() + dow);
        occStart.setUTCHours(dtstart.getUTCHours(), dtstart.getUTCMinutes(), dtstart.getUTCSeconds());
        if (occStart < dtstart) continue;
        if (until && occStart > until) continue;
        results.push({ start: occStart, end: new Date(occStart.getTime() + duration) });
        generated++;
        if (count && generated >= count) break;
      }
      weekCount++;
      weekStart.setUTCDate(weekStart.getUTCDate() + 7 * interval);
      if ((count && generated >= count) || weekCount > 60) break;
    }
  } else if (freq === 'MONTHLY' && bymonthday) {
    let cursor = new Date(dtstart);
    let generated = 0;
    while (generated < (count || maxOccurrences) && cursor < maxWindow) {
      const occ = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), bymonthday, dtstart.getUTCHours(), dtstart.getUTCMinutes()));
      if (occ >= dtstart && (!until || occ <= until)) {
        results.push({ start: occ, end: new Date(occ.getTime() + duration) });
        generated++;
      }
      cursor.setUTCMonth(cursor.getUTCMonth() + interval);
    }
  } else if (freq === 'DAILY') {
    let cursor = new Date(dtstart);
    let generated = 0;
    while (generated < (count || maxOccurrences) && cursor < maxWindow) {
      if (!until || cursor <= until) {
        results.push({ start: new Date(cursor), end: new Date(cursor.getTime() + duration) });
        generated++;
      }
      cursor.setUTCDate(cursor.getUTCDate() + interval);
    }
  } else {
    results.push({ start: dtstart, end: dtend });
  }
  return results;
}

function parseICS(text) {
  const unfolded = unfoldICS(text);
  const blocks = unfolded.split('BEGIN:VEVENT').slice(1);
  const events = [];
  for (const block of blocks) {
    const body = block.split('END:VEVENT')[0];
    const lines = body.split('\n').filter(Boolean);
    const props = {};
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const left = line.slice(0, idx);
      const value = line.slice(idx + 1);
      const [name, ...paramParts] = left.split(';');
      const params = {};
      paramParts.forEach(p => { const [k, v] = p.split('='); params[k] = v; });
      props[name] = { value, params };
    }
    if (!props.DTSTART || !props.SUMMARY) continue;
    if (props.STATUS && props.STATUS.value === 'CANCELLED') continue;

    const startInfo = parseICSDate(props.DTSTART.value, props.DTSTART.params);
    const endInfo = props.DTEND ? parseICSDate(props.DTEND.value, props.DTEND.params) : startInfo;
    const summary = decodeICSText(props.SUMMARY.value);
    const description = props.DESCRIPTION ? decodeICSText(props.DESCRIPTION.value) : '';
    const location = props.LOCATION ? decodeICSText(props.LOCATION.value) : '';
    const meetMatch = description.match(/https:\/\/meet\.google\.com\/[a-z-]+/i);
    const meetLink = (props['X-GOOGLE-CONFERENCE'] && props['X-GOOGLE-CONFERENCE'].value) || (meetMatch ? meetMatch[0] : null);
    const uid = props.UID ? props.UID.value : Math.random().toString(36);
    const base = { uid, title: summary, location: location || null, meetLink: meetLink || null, allDay: startInfo.allDay };

    if (props.RRULE) {
      const occs = expandRRule(props.RRULE.value, startInfo.date, endInfo.date);
      occs.forEach((occ, i) => events.push({ ...base, uid: uid + '-' + i, start: occ.start, end: occ.end }));
    } else {
      events.push({ ...base, start: startInfo.date, end: endInfo.date });
    }
  }
  return events;
}

async function getCalendarEvents(env) {
  const resp = await fetch(env.GCAL_ICS_URL);
  if (!resp.ok) throw new Error('Falha ao buscar calendário: ' + resp.status);
  const text = await resp.text();
  const events = parseICS(text);
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const windowEnd = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
  return events
    .filter(e => e.end >= todayStart && e.start <= windowEnd)
    .sort((a, b) => a.start - b.start)
    .map(e => ({
      uid: e.uid,
      title: e.title,
      start: e.start.toISOString(),
      end: e.end.toISOString(),
      allDay: e.allDay,
      location: e.location,
      meetLink: e.meetLink,
    }));
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(pingSupabase(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });

    if (url.pathname === '/calendar') {
      try {
        const events = await getCalendarEvents(env);
        return new Response(JSON.stringify({ ok: true, events, fetchedAt: new Date().toISOString() }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }
    }

    const result = await pingSupabase(env);
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  },
};
