import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'
import { ApiRoom } from '@/features/rooms/api/ApiRoom'
import { useUser, UserAware } from '@/features/auth'
import { Screen } from '@/layout/Screen'
import { navigateTo } from '@/navigation/navigateTo'
import './Meetings.css'

const MeetingsContent = () => {
  const { user } = useUser()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => fetchApi<{ results: ApiRoom[] }>('rooms/'),
    enabled: !!user,
  })

  const rooms = data?.results ?? []

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const updateMutation = useMutation({
    mutationFn: ({ roomId, date, time }: { roomId: string; date: string | null; time: string | null }) =>
      fetchApi(`rooms/${roomId}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          scheduled_date: date || null,
          scheduled_time: time || null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (roomId: string) =>
      fetchApi(`rooms/${roomId}/`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
    },
  })

  const handleEdit = useCallback((room: ApiRoom) => {
    setEditingId(room.id)
    setEditDate(room.scheduled_date || '')
    setEditTime(room.scheduled_time?.slice(0, 5) || '')
  }, [])

  const handleSave = useCallback((roomId: string) => {
    updateMutation.mutate({ roomId, date: editDate || null, time: editTime || null })
  }, [editDate, editTime, updateMutation])

  const handleDelete = useCallback((room: ApiRoom) => {
    if (window.confirm(`Supprimer la réunion ${room.slug} ?`)) {
      deleteMutation.mutate(room.id)
    }
  }, [deleteMutation])

  const handleCopy = useCallback((room: ApiRoom) => {
    navigator.clipboard.writeText(`${window.location.origin}/${room.slug}`)
    setCopiedId(room.id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const sorted = [...rooms].sort((a, b) => {
    if (a.scheduled_date && b.scheduled_date) return a.scheduled_date > b.scheduled_date ? 1 : -1
    if (a.scheduled_date) return -1
    if (b.scheduled_date) return 1
    return 0
  })

  if (isLoading) {
    return <div className="meetings-page"><div className="meetings-empty">Chargement...</div></div>
  }

  return (
    <div className="meetings-page">
      <h1>Mes réunions</h1>

      {sorted.length === 0 ? (
        <div className="meetings-empty">
          Aucune réunion pour le moment. Créez-en une depuis le tableau de bord.
        </div>
      ) : (
        sorted.map((room) => (
          <div key={room.id} className="meeting-card">
            <div className="meeting-info">
              {room.scheduled_date ? (
                <div className="meeting-date">
                  {new Date(room.scheduled_date + 'T00:00:00').toLocaleDateString('fr-FR', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                  })}
                  {room.scheduled_time && ` — ${room.scheduled_time.slice(0, 5)}`}
                </div>
              ) : (
                <div className="meeting-date" style={{ color: 'var(--text-muted)' }}>
                  Pas de date prévue
                </div>
              )}
              <div className="meeting-slug">{room.slug}</div>

              {editingId === room.id && (
                <div className="meeting-edit-row">
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                  />
                  <input
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                  />
                  <button
                    className="meeting-btn primary"
                    onClick={() => handleSave(room.id)}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? '...' : 'Enregistrer'}
                  </button>
                  <button className="meeting-btn" onClick={() => setEditingId(null)}>
                    Annuler
                  </button>
                </div>
              )}
            </div>

            <div className="meeting-actions">
              <button className="meeting-btn primary" onClick={() => navigateTo('room', room.slug)}>
                Rejoindre
              </button>
              <button className="meeting-btn" onClick={() => handleCopy(room)}>
                {copiedId === room.id ? 'Copié !' : 'Copier'}
              </button>
              {editingId !== room.id && (
                <button className="meeting-btn" onClick={() => handleEdit(room)}>
                  Modifier
                </button>
              )}
              <button className="meeting-btn danger" onClick={() => handleDelete(room)}>
                Supprimer
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

export const Meetings = () => {
  return (
    <UserAware>
      <Screen header={true} footer={false}>
        <MeetingsContent />
      </Screen>
    </UserAware>
  )
}
