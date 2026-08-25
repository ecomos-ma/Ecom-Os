import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Bell, RefreshCw, Plus, X, Megaphone } from "lucide-react";

interface Announcement {
  id: string;
  title: string;
  description: string;
  type: string;
  active: boolean;
  created_at: string;
}

export default function AnnouncementCenter() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState({
    title: '',
    description: '',
    type: 'info',
  });

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  async function fetchAnnouncements() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (error) {
      console.error('Error fetching announcements:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    try {
      const { error } = await supabase
        .from('announcements')
        .insert({
          title: newAnnouncement.title,
          description: newAnnouncement.description,
          type: newAnnouncement.type,
          active: true,
        });

      if (error) throw error;
      setNewAnnouncement({ title: '', description: '', type: 'info' });
      setShowCreate(false);
      await fetchAnnouncements();
    } catch (error) {
      console.error('Error creating announcement:', error);
      alert('Failed to create announcement');
    }
  }

  async function handleToggleActive(id: string, active: boolean) {
    try {
      const { error } = await supabase
        .from('announcements')
        .update({ active })
        .eq('id', id);

      if (error) throw error;
      await fetchAnnouncements();
    } catch (error) {
      console.error('Error toggling announcement:', error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this announcement?')) return;
    try {
      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchAnnouncements();
    } catch (error) {
      console.error('Error deleting announcement:', error);
    }
  }

  function getTypeColor(type: string) {
    switch (type) {
      case 'success': return 'text-emerald-400 bg-emerald-500/20';
      case 'warning': return 'text-amber-400 bg-amber-500/20';
      case 'critical': return 'text-red-400 bg-red-500/20';
      case 'security': return 'text-red-400 bg-red-500/20';
      default: return 'text-blue-400 bg-blue-500/20';
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">Announcement Center</h1>
        <p className="text-slate-400">Manage platform-wide announcements</p>
      </div>

      <div className="mb-6 flex gap-4">
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-brand-accent hover:bg-brand-accent/80 rounded text-white flex items-center gap-2"
        >
          <Plus size={18} />
          Create Announcement
        </button>
        <button
          onClick={fetchAnnouncements}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-white flex items-center gap-2"
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 bg-slate-900/50 border border-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Create Announcement</h3>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Title"
              value={newAnnouncement.title}
              onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white"
            />
            <textarea
              placeholder="Description"
              value={newAnnouncement.description}
              onChange={(e) => setNewAnnouncement({ ...newAnnouncement, description: e.target.value })}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white h-24"
            />
            <select
              value={newAnnouncement.type}
              onChange={(e) => setNewAnnouncement({ ...newAnnouncement, type: e.target.value })}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white"
            >
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
              <option value="security">Security</option>
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-brand-accent hover:bg-brand-accent/80 rounded text-white"
              >
                Create
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {announcements.map((announcement) => (
          <div key={announcement.id} className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${getTypeColor(announcement.type)}`}>
                  <Megaphone size={18} />
                </div>
                <div>
                  <div className="font-semibold text-white">{announcement.title}</div>
                  <div className="text-sm text-slate-400 mt-1">{announcement.description}</div>
                  <div className="text-xs text-slate-500 mt-2">
                    {new Date(announcement.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleActive(announcement.id, !announcement.active)}
                  className={`px-3 py-1 rounded text-sm ${
                    announcement.active ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 hover:bg-slate-600'
                  } text-white`}
                >
                  {announcement.active ? 'Active' : 'Inactive'}
                </button>
                <button
                  onClick={() => handleDelete(announcement.id)}
                  className="p-2 hover:bg-slate-700 rounded text-red-400"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}