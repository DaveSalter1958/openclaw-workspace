#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const dataPath = path.join(workspaceRoot, 'data', 'golf', 'rounds.json');

function usage(exitCode = 0) {
  const text = `
Golf store commands:
  start-round --date YYYY-MM-DD --course NAME [--tee-color COLOR] [--tee-name NAME] [--postable yes|no] [--format FORMAT] [--game NAME] [--players "Dave,Steve"] [--notes TEXT]
  add-shot --round latest|ROUND_ID --hole N [--shot N] [--club CLUB] [--from AREA] [--to AREA] [--distance YARDS] [--result TEXT] [--penalty N] [--text RAW]
  hole --round latest|ROUND_ID --hole N --score N [--putts N] [--fairway hit|miss-left|miss-right|short|long|na] [--gir yes|no] [--penalties N] [--notes TEXT]
  note --round latest|ROUND_ID [--hole N] --text RAW
  finish-round --round latest|ROUND_ID
  list
  show --round latest|ROUND_ID
  summary --round latest|ROUND_ID
  query --text WORDS
`;
  console.log(text.trim());
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function loadRounds() {
  if (!fs.existsSync(dataPath)) return [];
  const raw = fs.readFileSync(dataPath, 'utf8').trim();
  if (!raw) return [];
  return JSON.parse(raw);
}

function saveRounds(rounds) {
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(dataPath, `${JSON.stringify(rounds, null, 2)}\n`);
}

function nowIso() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || 'round')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'round';
}

function asBool(value, defaultValue = undefined) {
  if (value === undefined) return defaultValue;
  const normalized = String(value).toLowerCase();
  if (['yes', 'true', 'y', '1', 'postable'].includes(normalized)) return true;
  if (['no', 'false', 'n', '0', 'not-postable', 'non-postable'].includes(normalized)) return false;
  throw new Error(`Expected yes/no boolean, got: ${value}`);
}

function asNumber(value, key, required = false) {
  if (value === undefined || value === '') {
    if (required) throw new Error(`Missing required --${key}`);
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`--${key} must be a number`);
  return parsed;
}

function requireString(args, key) {
  const value = args[key];
  if (!value || typeof value !== 'string') throw new Error(`Missing required --${key}`);
  return value;
}

function findRound(rounds, id) {
  if (!id || id === 'latest') {
    const active = rounds.find((round) => round.status === 'in_progress');
    return active || rounds[0];
  }
  return rounds.find((round) => round.id === id);
}

function getHole(round, holeNumber) {
  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    throw new Error('--hole must be an integer from 1 to 18');
  }
  let hole = round.holes.find((item) => item.number === holeNumber);
  if (!hole) {
    hole = { number: holeNumber, shots: [], notes: [] };
    round.holes.push(hole);
    round.holes.sort((a, b) => a.number - b.number);
  }
  return hole;
}

function startRound(args) {
  const rounds = loadRounds();
  const course = requireString(args, 'course');
  const date = args.date || new Date().toISOString().slice(0, 10);
  const createdAt = nowIso();
  const round = {
    id: `round-${date}-${slugify(course)}-${Date.now()}`,
    date,
    course,
    teeColor: args['tee-color'] || '',
    teeName: args['tee-name'] || '',
    postable: asBool(args.postable, undefined),
    format: args.format || '',
    gameType: args.game || '',
    players: args.players ? String(args.players).split(',').map((p) => p.trim()).filter(Boolean) : [],
    status: 'in_progress',
    holes: [],
    notes: args.notes || '',
    createdAt,
    updatedAt: createdAt,
  };
  rounds.unshift(round);
  saveRounds(rounds);
  console.log(JSON.stringify(round, null, 2));
}

function addShot(args) {
  const rounds = loadRounds();
  const round = findRound(rounds, args.round);
  if (!round) throw new Error('Round not found');
  const holeNumber = asNumber(args.hole, 'hole', true);
  const hole = getHole(round, holeNumber);
  const shotNumber = asNumber(args.shot, 'shot') || hole.shots.length + 1;
  const penalty = asNumber(args.penalty, 'penalty') || 0;
  const shot = {
    shot: shotNumber,
    club: args.club || '',
    from: args.from || '',
    to: args.to || '',
    distance: asNumber(args.distance, 'distance'),
    result: args.result || '',
    penalty,
    text: args.text || '',
    createdAt: nowIso(),
  };
  hole.shots = hole.shots.filter((item) => item.shot !== shotNumber);
  hole.shots.push(shot);
  hole.shots.sort((a, b) => a.shot - b.shot);
  round.updatedAt = nowIso();
  saveRounds(rounds);
  console.log(JSON.stringify({ roundId: round.id, hole: hole.number, shot }, null, 2));
}

function scoreHole(args) {
  const rounds = loadRounds();
  const round = findRound(rounds, args.round);
  if (!round) throw new Error('Round not found');
  const holeNumber = asNumber(args.hole, 'hole', true);
  const hole = getHole(round, holeNumber);
  hole.score = asNumber(args.score, 'score', true);
  hole.putts = asNumber(args.putts, 'putts');
  hole.fairway = args.fairway || hole.fairway || '';
  hole.gir = asBool(args.gir, hole.gir);
  hole.penalties = asNumber(args.penalties, 'penalties');
  if (args.notes) hole.notes.push({ text: args.notes, createdAt: nowIso() });
  round.updatedAt = nowIso();
  saveRounds(rounds);
  console.log(JSON.stringify({ roundId: round.id, hole }, null, 2));
}

function addNote(args) {
  const rounds = loadRounds();
  const round = findRound(rounds, args.round);
  if (!round) throw new Error('Round not found');
  const text = requireString(args, 'text');
  const note = { text, createdAt: nowIso() };
  if (args.hole !== undefined) {
    const hole = getHole(round, asNumber(args.hole, 'hole', true));
    hole.notes.push(note);
  } else {
    round.roundNotes = round.roundNotes || [];
    round.roundNotes.push(note);
  }
  round.updatedAt = nowIso();
  saveRounds(rounds);
  console.log(JSON.stringify({ roundId: round.id, note }, null, 2));
}

function finishRound(args) {
  const rounds = loadRounds();
  const round = findRound(rounds, args.round);
  if (!round) throw new Error('Round not found');
  round.status = 'completed';
  round.completedAt = nowIso();
  round.updatedAt = round.completedAt;
  saveRounds(rounds);
  console.log(JSON.stringify(roundSummary(round), null, 2));
}

function roundSummary(round) {
  const scored = round.holes.filter((hole) => typeof hole.score === 'number');
  const totalScore = scored.reduce((sum, hole) => sum + hole.score, 0);
  const totalPutts = round.holes.reduce((sum, hole) => sum + (typeof hole.putts === 'number' ? hole.putts : 0), 0);
  const penalties = round.holes.reduce((sum, hole) => {
    const holePenalties = typeof hole.penalties === 'number' ? hole.penalties : 0;
    const shotPenalties = hole.shots.reduce((shotSum, shot) => shotSum + (shot.penalty || 0), 0);
    return sum + holePenalties + shotPenalties;
  }, 0);
  return {
    id: round.id,
    date: round.date,
    course: round.course,
    teeColor: round.teeColor,
    postable: round.postable,
    format: round.format,
    gameType: round.gameType,
    status: round.status,
    holesScored: scored.length,
    totalScore: scored.length ? totalScore : undefined,
    totalPutts: totalPutts || undefined,
    penalties: penalties || undefined,
  };
}

function listRounds() {
  const summaries = loadRounds().map(roundSummary);
  console.log(JSON.stringify(summaries, null, 2));
}

function showRound(args) {
  const round = findRound(loadRounds(), args.round);
  if (!round) throw new Error('Round not found');
  console.log(JSON.stringify(round, null, 2));
}

function summarizeRound(args) {
  const round = findRound(loadRounds(), args.round);
  if (!round) throw new Error('Round not found');
  console.log(JSON.stringify(roundSummary(round), null, 2));
}

function queryRounds(args) {
  const terms = requireString(args, 'text')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const matches = loadRounds().filter((round) => {
    const haystack = JSON.stringify(round).toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  console.log(JSON.stringify(matches.map(roundSummary), null, 2));
}

const [command, ...argv] = process.argv.slice(2);
if (!command || command === 'help' || command === '--help') usage(0);

try {
  const args = parseArgs(argv);
  if (command === 'start-round') startRound(args);
  else if (command === 'add-shot') addShot(args);
  else if (command === 'hole') scoreHole(args);
  else if (command === 'note') addNote(args);
  else if (command === 'finish-round') finishRound(args);
  else if (command === 'list') listRounds();
  else if (command === 'show') showRound(args);
  else if (command === 'summary') summarizeRound(args);
  else if (command === 'query') queryRounds(args);
  else usage(1);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
