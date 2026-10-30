import { useState } from 'react';
import { cloudConfigured, downloadCloud, login, logout, resetPassword, uploadCloud, useCloud } from '../../persistence/cloud';
import { readSlot, SLOTS, writeSlot, type SlotId } from '../../persistence/storage';
import { useGame } from '../../store/game-store';

export function CloudSaves() {
  const { email, status } = useCloud();
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [slot, setSlot] = useState<SlotId>('autosave');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function act(fn: () => Promise<void>) {
    setBusy(true); setMessage('');
    try { await fn(); } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="mb-3 border-b border-slate-600 pb-3 text-xs">
    <div className="label mb-2">Cloud saves · email sign-in</div>
    {!cloudConfigured ? <p>Cloud saves need Firebase setup. Local saves work normally.</p> : !email ? <form className="space-y-2" onSubmit={e => { e.preventDefault(); void act(async () => { await login(address, password); setPassword(''); }); }}>
      <input className="input" aria-label="Cloud email" placeholder="Email" type="email" autoComplete="username" required value={address} onChange={e => setAddress(e.target.value)} />
      <input className="input" aria-label="Cloud password" placeholder="Password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
      <button className="btn" disabled={busy}>Sign in</button>{' '}
      <button className="btn" type="button" disabled={busy || !address} onClick={() => void act(async () => { await resetPassword(address); setMessage('Password reset requested. Check your email.'); })}>Reset password</button>
    </form> : <div className="space-y-2">
      <div>{email} <button className="btn" disabled={busy} onClick={() => void act(logout)}>Sign out</button></div>
      <select className="input" aria-label="Cloud save slot" value={slot} onChange={e => setSlot(e.target.value as SlotId)}>{SLOTS.map(s => <option key={s}>{s}</option>)}</select>
      <button className="btn" disabled={busy} onClick={() => void act(async () => {
        const json = await readSlot(slot); if (!json) throw new Error('Save locally to this slot first.');
        await uploadCloud(slot, json); setMessage('Cloud sync enabled for this slot.');
      })}>Upload local save</button>{' '}
      <button className="btn" disabled={busy} onClick={() => void act(async () => {
        if (!window.confirm('Load cloud progress? Save current progress to another local slot first if you want to keep it.')) return;
        useGame.getState().pause();
        const json = await downloadCloud(slot); await writeSlot(slot, json);
        if (await useGame.getState().load(slot)) setMessage('Loaded cloud progress. Future saves to this slot sync automatically.');
      })}>Load cloud save</button>
    </div>}
    <p className="mt-2" role="status">{message || status}</p>
  </section>;
}
