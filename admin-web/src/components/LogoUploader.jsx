import { useEffect, useRef, useState } from 'react';
import { Building2, ImageUp, Save, Trash2 } from 'lucide-react';
import { api, errorMessage, fileUrl } from '../api/client';
import { useToast } from '../context/ToastContext';
import { Button, ConfirmDialog, cx } from './ui';

const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_MB = 5;
const KINDS = {
  logo: { endpoint: '/settings/logo', field: 'logo', urlKey: 'logoUrl', label: 'Logo', noun: 'logo', hint: "Shown in this portal and in your tenants' app. A square image works best", removeMsg: 'The portal and the tenant app will show the plain house icon again.' },
  cover: { endpoint: '/settings/cover', field: 'cover', urlKey: 'coverUrl', label: 'Boarding house photo', noun: 'photo', hint: 'The large picture at the top of your public page (Send Inquiry). Use a wide photo of the building or common area, not of tenants', removeMsg: 'Your public page will show a plain background instead.' },
};

/**
 * Boarding house logo: choose an image, preview it, then "Save logo".
 * The saved logo is used in the admin sidebar, the sign-in pages and the tenant app.
 * onChange(logoUrl | null) is called after a save or removal.
 */
export default function LogoUploader({ logoUrl, onChange, kind = 'logo' }) {
  const k = KINDS[kind];
  const toast = useToast();
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!TYPES.includes(f.type)) return setError('Please choose a JPG, PNG or WEBP image.');
    if (f.size > MAX_MB * 1024 * 1024) return setError(`That image is larger than ${MAX_MB} MB. Please choose a smaller one.`);
    setError('');
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const cancel = () => {
    setFile(null);
    setPreview('');
    setError('');
  };

  const save = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append(k.field, file);
      const res = await api.post(k.endpoint, fd);
      toast.success(res.data.message || 'Saved.');
      cancel();
      onChange?.(res.data[k.urlKey]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await api.delete(k.endpoint);
      toast.success(res.data.message || 'Removed.');
      setConfirmRemove(false);
      onChange?.(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const shown = preview || (logoUrl ? fileUrl(logoUrl) : '');
  return (
    <div className="sm:col-span-2">
      <p className="label">{k.label}</p>
      <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-4 sm:flex-row sm:items-center">
        <div className={cx('flex shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-card ring-1 ring-slate-200', kind === 'cover' ? 'aspect-[16/9] w-full bg-slate-100 sm:w-56' : 'h-24 w-24 bg-[#fff]')}>
          {shown ? <img src={shown} alt={kind === 'cover' ? 'Boarding house photo' : 'Boarding house logo'} className={cx('h-full w-full', kind === 'cover' ? 'object-cover' : 'object-contain')} /> : <Building2 className="h-9 w-9 text-slate-400" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">{file ? 'Preview: not saved yet' : logoUrl ? `Your current ${k.noun}` : `No ${k.noun} yet`}</p>
          <p className="mt-0.5 text-sm text-slate-500">{k.hint} (JPG, PNG or WEBP, up to {MAX_MB} MB).</p>
          {error && <p className="mt-1 text-sm font-medium text-red-600">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {file ? (
              <>
                <Button icon={Save} loading={busy} onClick={save}>
                  Save {k.noun}
                </Button>
                <Button variant="secondary" onClick={cancel} disabled={busy}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" icon={ImageUp} onClick={() => input.current?.click()}>
                  {logoUrl ? `Change ${k.noun}` : 'Choose image'}
                </Button>
                {logoUrl && (
                  <Button variant="ghost" icon={Trash2} className="text-red-700" onClick={() => setConfirmRemove(true)}>
                    Remove
                  </Button>
                )}
              </>
            )}
          </div>
          <input ref={input} type="file" accept={TYPES.join(',')} className="sr-only" tabIndex={-1} aria-hidden onChange={pick} />
        </div>
      </div>
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title={`Remove the ${k.noun}?`}
        message={k.removeMsg}
        confirmLabel="Remove"
        tone="danger"
        loading={busy}
        onConfirm={remove}
      />
    </div>
  );
}
