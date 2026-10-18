'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const e=require('../lib/economy');
const player=(n)=>({id:'p'+n,name:'Гость '+n,score:0});
const initial=()=>({participants:[player(1),player(2),player(3)],transactions:[]});
function post(state,params){const tx=e.validateTransaction(state,{...params,actor:'tester'});state.transactions.push(tx);return tx;}
test('all players begin at $1800 and total capital is unchanged in poker',()=>{
  const s=initial();
  post(s,{kind:'game',game:'poker',entries:[{playerId:'p1',delta:150},{playerId:'p2',delta:-100},{playerId:'p3',delta:-50}]});
  const b=e.calculate(s.participants,s.transactions);
  assert.deepEqual(b.participants.map(x=>x.wallet),[1950,1700,1750]);
  assert.equal(b.bank,1450);
  assert.equal(e.sorted(b,'poker')[0].id,'p1');
  assert.equal(e.sorted(b,'overall')[0].netWorth,1950);
});
test('poker cannot mint chips',()=>{
  const s=initial();
  assert.throws(()=>post(s,{kind:'game',game:'poker',entries:[{playerId:'p1',delta:200},{playerId:'p2',delta:-100}]}),/сумма/);
});
test('casino wins and losses are balanced against house',()=>{
  const s=initial();
  post(s,{kind:'game',game:'roulette',entries:[{playerId:'p1',delta:175},{playerId:'p2',delta:-25}]});
  assert.equal(e.calculate(s.participants,s.transactions).bank,1300);
  assert.equal(e.sorted(e.calculate(s.participants,s.transactions),'roulette')[0].score,175);
});
test('bonuses count separately, and each guest has a $700 activity cap',()=>{
  const s=initial();
  post(s,{kind:'bonus',game:'activities',entries:[{playerId:'p1',delta:400}]});
  assert.equal(e.calculate(s.participants,s.transactions).participants[0].bonus,400);
  assert.throws(()=>post(s,{kind:'bonus',game:'activities',entries:[{playerId:'p1',delta:301}]}),/лимит/);
});
test('loan debt reduces overall wealth and repayment cannot exceed debt',()=>{
  const s=initial();
  post(s,{kind:'loan',game:'credit',entries:[{playerId:'p1',delta:500}]});
  const b=e.calculate(s.participants,s.transactions);
  assert.equal(b.participants[0].wallet,2300);
  assert.equal(b.participants[0].netWorth,1800);
  post(s,{kind:'loan',game:'credit',entries:[{playerId:'p1',delta:-300}]});
  assert.equal(e.calculate(s.participants,s.transactions).participants[0].debt,200);
  assert.throws(()=>post(s,{kind:'loan',game:'credit',entries:[{playerId:'p1',delta:-201}]}),/лимит/);
});
test('reversal is auditable, cannot be repeated and restores ranking',()=>{
  const s=initial();
  const tx=post(s,{kind:'game',game:'blackjack',entries:[{playerId:'p1',delta:30}]});
  const reverse=e.reverseTransaction(s,tx.id,'owner');
  s.transactions.push(reverse);
  assert.equal(e.calculate(s.participants,s.transactions).participants[0].wallet,1800);
  assert.equal(e.calculate(s.participants,s.transactions).bank,1450);
  assert.throws(()=>e.reverseTransaction(s,tx.id,'owner'),/отменена/);
});
test('player cannot spend more than available funds',()=>{
  const s=initial();
  assert.throws(()=>post(s,{kind:'game',game:'craps',entries:[{playerId:'p1',delta:-1801}]}),/Недостаточно/);
});
