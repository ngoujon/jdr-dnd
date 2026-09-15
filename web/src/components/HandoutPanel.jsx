import { useState } from 'react';
import { api } from '../lib/api.js';
import { useTable } from '../lib/store.js';
import { Modal, RichText, useToast, useConfirm, LazyInput } from './Ui.jsx';
import { AssetLibrary } from './AssetLibrary.jsx';

/** Documents distribuables : notes, images, indices. Le MJ choisit qui les voit. */
export function HandoutPanel() {
  const handouts = useTable((s) => s.handouts);
  const campaign = useTable((s) => s.campaign);
  const campaignId = useTable((s) => s.campaignId);
  const isGM = useTable((s) => s.isGM);
  const refreshHandouts = useTable((s) => s.refreshHandouts);
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [picking, setPicking] = useState(false);

  const opened = handouts.find((h) => h.id === openId);

  const create = async () => {
    try {
      const { handout } = await api.post(`/campaigns/${campaignId}/handouts`, { title: 'Nouveau document' });
      await refreshHandouts();
      setEditing(handout);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const save = async (id, patch) => {
    try {
      const { handout } = await api.patch(`/campaigns/${campaignId}/handouts/${id}`, patch);
      setEditing((current) => (current?.id === id ? handout : current));
      await refreshHandouts();
      return handout;
    } catch (err) {
      toast(err.message, 'error');
      return null;
    }
  };

  const remove = async (handout) => {
    const ok = await confirm({
      title: 'Supprimer le document',
      message: `« ${handout.title} » sera supprimé pour tout le monde.`,
      danger: true,
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    await api.del(`/campaigns/${campaignId}/handouts/${handout.id}`);
    await refreshHandouts();
  };

  return (
    <div className="handout-panel scroll">
      {confirmNode}
      <div className="row" style={{ padding: '0 10px 8px' }}>
        <h4 className="panel-title">Documents</h4>
        <span className="spacer" />
        {isGM ? (
          <button type="button" className="btn xs primary" onClick={create}>
            + Nouveau
          </button>
        ) : null}
      </div>

      <ul className="handout-list">
        {handouts.map((handout) => (
          <li key={handout.id}>
            <button type="button" className="handout-btn" onClick={() => setOpenId(handout.id)}>
              {handout.imageUrl ? (
                <span className="handout-thumb" style={{ background: `center/cover url(${handout.imageUrl})` }} />
              ) : (
                <span className="handout-thumb doc">✦</span>
              )}
              <span className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                <strong className="ellipsis">{handout.title}</strong>
                <span className="faint" style={{ fontSize: 11 }}>
                  {handout.isPublic
                    ? 'visible par la table'
                    : handout.sharedWith?.length
                      ? `partagé avec ${handout.sharedWith.length} joueur(s)`
                      : 'privé (MJ)'}
                </span>
              </span>
            </button>
            {isGM ? (
              <div className="row" style={{ gap: 3 }}>
                <button
                  type="button"
                  className={`btn xs ${handout.isPublic ? 'active' : ''}`}
                  onClick={() => save(handout.id, { isPublic: !handout.isPublic })}
                  title="Partager avec toute la table"
                >
                  {handout.isPublic ? 'Partage' : 'Partager'}
                </button>
                <button type="button" className="btn xs ghost" onClick={() => setEditing(handout)} title="Modifier">
                  ✎
                </button>
                <button type="button" className="btn xs ghost" onClick={() => remove(handout)} title="Supprimer">
                  ✕
                </button>
              </div>
            ) : null}
          </li>
        ))}
        {!handouts.length ? (
          <li className="empty">
            {isGM
              ? 'Préparez vos notes, cartes et indices à distribuer en jeu.'
              : "Le MJ n'a encore rien partage."}
          </li>
        ) : null}
      </ul>

      <Modal open={Boolean(opened)} title={opened?.title || ''} onClose={() => setOpenId(null)} size="lg">
        {opened?.imageUrl ? <img className="handout-image" src={opened.imageUrl} alt={opened.title} /> : null}
        <RichText text={opened?.content || ''} />
      </Modal>

      <Modal
        open={Boolean(editing)}
        title="Modifier le document"
        onClose={() => setEditing(null)}
        size="lg"
        footer={
          <button type="button" className="btn primary" onClick={() => setEditing(null)}>
            Fermer
          </button>
        }
      >
        {editing ? (
          <div className="col" style={{ gap: 12 }}>
            <div className="field">
              <label>Titre</label>
              <LazyInput value={editing.title} onCommit={(title) => save(editing.id, { title })} />
            </div>
            <div className="field">
              <label>Contenu (Markdown simple)</label>
              <LazyInput
                as="textarea"
                className="textarea"
                rows={10}
                value={editing.content}
                onCommit={(content) => save(editing.id, { content })}
                placeholder={'# Titre\n\nUn indice **important**…\n\n- point un\n- point deux'}
              />
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn sm" onClick={() => setPicking(true)}>
                Illustration
              </button>
              {editing.imageUrl ? (
                <button type="button" className="btn sm ghost" onClick={() => save(editing.id, { imageUrl: null })}>
                  Retirer l'image
                </button>
              ) : null}
            </div>
            <div className="field">
              <label>Partage cible</label>
              <div className="row wrap" style={{ gap: 6 }}>
                {(campaign?.members || [])
                  .filter((m) => m.userId !== campaign.gmId)
                  .map((member) => {
                    const on = editing.sharedWith?.includes(member.userId);
                    return (
                      <button
                        key={member.userId}
                        type="button"
                        className={`btn xs ${on ? 'active' : ''}`}
                        onClick={() =>
                          save(editing.id, {
                            sharedWith: on
                              ? editing.sharedWith.filter((id) => id !== member.userId)
                              : [...(editing.sharedWith || []), member.userId],
                          })
                        }
                      >
                        {member.username}
                      </button>
                    );
                  })}
              </div>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={editing.isPublic}
                onChange={(e) => save(editing.id, { isPublic: e.target.checked })}
              />
              Visible par toute la table
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal open={picking} title="Choisir une illustration" onClose={() => setPicking(false)} size="lg">
        <AssetLibrary
          uploadKind="HANDOUT"
          onPick={(asset) => {
            save(editing.id, { imageUrl: asset.url });
            setPicking(false);
          }}
        />
      </Modal>
    </div>
  );
}
