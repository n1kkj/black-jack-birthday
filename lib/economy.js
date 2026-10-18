'use strict';

const crypto = require('crypto');
const GAME_KEYS = ['poker', 'craps', 'blackjack', 'roulette'];
const LABELS = {poker: 'Покер', craps: 'Крэпс', blackjack: 'Блэкджек', roulette: 'Рулетка', activities: 'Активности', credit: 'Кредит', adjustment: 'Корректировка'};
const START_CASH = 1800;
const BONUS_LIMIT = 700;
const CREDIT_LIMIT = 500;
const TOTAL_CREDIT_LIMIT = 2000;
const HOUSE_FLOAT = 1450;
const MAX_GUESTS = 23;
const PHYSICAL_TOTAL = 58950;

function total(entries) { return entries.reduce((sum, row) => sum + row.delta, 0); }
function cleanGuests(guests) {
  return guests.map((guest) => ({
    id: guest.id, name: guest.name, avatar: guest.avatar || '', emoji: guest.emoji || '♠',
    serial: guest.serial || '', archived: !!guest.archived,
    legacy: Number.isSafeInteger(guest.score) ? guest.score : 0,
    games: {poker: 0, craps: 0, blackjack: 0, roulette: 0},
    bonus: 0, adjustment: 0, credit: 0, debt: 0,
    starting: START_CASH, wallet: START_CASH + (Number.isSafeInteger(guest.score) ? guest.score : 0)
  }));
}
function calculate(guests, transactions) {
  const members = cleanGuests(guests);
  const lookup = new Map(members.map((p) => [p.id, p]));
  let bank = HOUSE_FLOAT;
  for (const tx of transactions) {
    for (const item of tx.entries) {
      const p = lookup.get(item.playerId);
      if (!p) continue;
      p.wallet += item.delta;
      if (tx.kind === 'bonus') p.bonus += item.delta;
      else if (tx.kind === 'loan') { p.credit += item.delta; p.debt += item.delta; }
      else if (tx.kind === 'adjustment') p.adjustment += item.delta;
      else if (GAME_KEYS.includes(tx.game)) p.games[tx.game] += item.delta;
    }
    if (tx.kind !== 'bonus') bank -= total(tx.entries);
  }
  members.forEach((p) => { p.netWorth = p.wallet - p.debt; p.gameProfit = GAME_KEYS.reduce((n, k) => n + p.games[k], 0); });
  const active = members.filter((p) => !p.archived);
  const bonuses = members.reduce((n, p) => n + p.bonus, 0);
  const credit = members.reduce((n, p) => n + p.debt, 0);
  const outstandingReserve = members.reduce((n, p) => n + Math.max(0, BONUS_LIMIT - p.bonus), 0);
  return {
    participants: active,
    allParticipants: members,
    bank,
    outstandingReserve,
    activeCredit: credit,
    bonuses,
    initial: START_CASH,
    physicalTotal: PHYSICAL_TOTAL,
    unbacked: Math.max(0, active.reduce((n,p)=>n+p.wallet,0) + bank + outstandingReserve - PHYSICAL_TOTAL)
  };
}
function sorted(board, game) {
  const value = (p) => game === 'overall' ? p.netWorth : game === 'activities' ? p.bonus : p.games[game];
  return [...board.participants].sort((a,b) => value(b)-value(a) || b.gameProfit-a.gameProfit || a.name.localeCompare(b.name,'ru'))
    .map((p,i)=>({...p, rank:i+1, score:value(p)}));
}
function validateTransaction(state, input) {
  const kind = String(input.kind || 'game');
  const game = String(input.game || '');
  if (!['game','bonus','loan','adjustment'].includes(kind)) throw Error('Неизвестный тип операции');
  if ((kind === 'game' && !GAME_KEYS.includes(game)) || (kind === 'bonus' && game !== 'activities') ||
      (kind === 'loan' && game !== 'credit') || (kind === 'adjustment' && game !== 'adjustment')) throw Error('Некорректная игра');
  if (!Array.isArray(input.entries) || input.entries.length === 0 || input.entries.length > MAX_GUESTS) throw Error('Укажите участников операции');
  const existing = calculate(state.participants, state.transactions);
  const participants = new Map(existing.participants.map((p) => [p.id,p]));
  const used = new Set();
  const entries = input.entries.map((item) => {
    const playerId = String(item.playerId || '');
    const delta = Number(item.delta);
    if (!participants.has(playerId) || used.has(playerId)) throw Error('Участник не найден или повторяется');
    if (!Number.isSafeInteger(delta) || !delta || Math.abs(delta)>100000) throw Error('Сумма должна быть целым ненулевым числом');
    used.add(playerId);
    const p = participants.get(playerId);
    if (p.wallet + delta < 0) throw Error('Недостаточно средств у: ' + p.name);
    if (kind === 'bonus' && (delta < 0 || p.bonus + delta > BONUS_LIMIT)) throw Error('Превышен персональный лимит наград 700 $: ' + p.name);
    if (kind === 'loan' && (p.debt + delta < 0 || p.debt + delta > CREDIT_LIMIT)) throw Error('Лимит кредита 500 $: ' + p.name);
    return {playerId, delta};
  });
  if (kind === 'game' && game === 'poker' && (entries.length<2 || total(entries)!==0)) throw Error('Покер: сумма выигрышей и проигрышей должна равняться нулю');
  if (kind === 'loan' && existing.activeCredit + total(entries)>TOTAL_CREDIT_LIMIT) throw Error('Общий кредитный фонд: максимум 2 000 $');
  const note = String(input.note || '').trim().slice(0,240);
  if (kind === 'adjustment' && note.length < 4) throw Error('Для корректировки укажите причину');
  return {id:crypto.randomUUID(),kind,game,entries,note,createdAt:new Date().toISOString(),createdBy:String(input.actor||'Администратор')};
}
function reverseTransaction(state, id, actor) {
  const tx = state.transactions.find((t)=>t.id===id);
  if (!tx) throw Error('Запись не найдена');
  if (tx.reversalOf || state.transactions.some((t)=>t.reversalOf===id)) throw Error('Операция уже отменена');
  const base=calculate(state.participants,state.transactions);
  const players=new Map(base.allParticipants.map((p)=>[p.id,p]));
  const entries=tx.entries.map((e)=>({playerId:e.playerId,delta:-e.delta}));
  for (const e of entries) {
    const p=players.get(e.playerId);
    if (!p || p.wallet+e.delta<0) throw Error('Нельзя отменить: средств у участника уже недостаточно');
    if (tx.kind==='loan' && p.debt+e.delta<0) throw Error('Нельзя отменить: кредит уже погашен');
    if (tx.kind==='bonus' && p.bonus+e.delta<0) throw Error('Нельзя отменить: бонус уже скорректирован');
  }
  return {id:crypto.randomUUID(),kind:tx.kind,game:tx.game,entries,note:'Отмена операции '+id.slice(0,8),createdAt:new Date().toISOString(),createdBy:actor,reversalOf:id};
}
module.exports={GAME_KEYS,LABELS,START_CASH,BONUS_LIMIT,HOUSE_FLOAT,MAX_GUESTS,PHYSICAL_TOTAL,calculate,sorted,validateTransaction,reverseTransaction};
