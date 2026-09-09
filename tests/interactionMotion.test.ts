import assert from 'node:assert/strict'
import test from 'node:test'
import { advanceInteraction, type InteractionSnapshot } from '../src/render/interaction'
const fresh=():InteractionSnapshot=>({pointer:[.5,.5],velocity:[0,0],amount:0,time:0})
test('hover follows continuously, caps velocity and returns after drag, leave or disable',()=>{
  const state=fresh()
  for(let i=0;i<60;i++)advanceInteraction(state,[.8,.4],1/60,.1,true,false)
  assert.ok(state.amount>.99);assert.ok(Math.abs(state.pointer[0]-.8)<.001)
  advanceInteraction(state,[0,0],1/120,0,true,false)
  assert.ok(state.velocity.every(value=>Number.isFinite(value)&&Math.abs(value)<=2))
  for(let i=0;i<120;i++)advanceInteraction(state,[0,0],1/60,.1,false,false)
  assert.ok(state.amount<.0001);assert.ok(state.velocity.every(value=>Math.abs(value)<.0001))
})
test('reduced motion has no residual motion or autonomous clock',()=>{
  const state=fresh();advanceInteraction(state,[.9,.2],.02,.1,true,true)
  assert.deepEqual(state,{pointer:[.9,.2],velocity:[0,0],amount:1,time:0})
  advanceInteraction(state,[.9,.2],.02,.1,false,true)
  assert.equal(state.amount,0);assert.equal(state.time,0)
})
test('negative, nonfinite and long frame deltas cannot destabilize hover state',()=>{
  const state=fresh()
  advanceInteraction(state,[1,1],NaN,.1,true,false)
  assert.deepEqual(state,fresh())
  advanceInteraction(state,[1,1],10,.1,true,false)
  assert.equal(state.time,.05);assert.ok(state.amount<1)
})
