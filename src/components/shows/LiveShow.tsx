import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Users, Eye, ThumbsUp, Trophy, Mic, MicOff, MessageCircle, Send, UserPlus, X } from 'lucide-react';
import { supabase, Show, Participant, VirtualSeat, SpeakerSeat, ShowComment } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface LiveShowProps {
  show: Show;
  onBack: () => void;
}

export default function LiveShow({ show, onBack }: LiveShowProps) {
  const { user, profile } = useAuth();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [userSeat, setUserSeat] = useState<VirtualSeat | null>(null);
  const [userVotes, setUserVotes] = useState<Set<string>>(new Set());
  const [speakerSeats, setSpeakerSeats] = useState<SpeakerSeat[]>([]);
  const [comments, setComments] = useState<ShowComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [viewers, setViewers] = useState<any[]>([]);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadShowData();
    const interval = setInterval(loadShowData, 3000);
    return () => clearInterval(interval);
  }, [show.id]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  const loadShowData = async () => {
    try {
      const [participantsRes, seatsRes, votesRes, speakerSeatsRes, commentsRes, viewersRes] = await Promise.all([
        supabase
          .from('participants')
          .select('*, user_profiles(full_name, avatar_url)')
          .eq('show_id', show.id)
          .in('status', ['approved', 'performing'])
          .order('total_votes', { ascending: false }),
        supabase
          .from('virtual_seats')
          .select('*')
          .eq('show_id', show.id),
        user ? supabase
          .from('votes')
          .select('participant_id')
          .eq('show_id', show.id)
          .eq('user_id', user.id) : null,
        supabase
          .from('speaker_seats')
          .select('*, user_profiles(full_name, avatar_url)')
          .eq('show_id', show.id)
          .order('seat_number', { ascending: true }),
        supabase
          .from('show_comments')
          .select('*, user_profiles(full_name)')
          .eq('show_id', show.id)
          .order('created_at', { ascending: true })
          .limit(50),
        supabase
          .from('virtual_seats')
          .select('*, user_profiles(full_name)')
          .eq('show_id', show.id),
      ]);

      if (participantsRes.error) throw participantsRes.error;
      setParticipants(participantsRes.data || []);

      if (seatsRes.error) throw seatsRes.error;
      setViewerCount(seatsRes.data?.length || 0);

      const mySeat = seatsRes.data?.find(s => s.user_id === user?.id);
      setUserSeat(mySeat || null);

      if (votesRes && !votesRes.error) {
        setUserVotes(new Set(votesRes.data?.map(v => v.participant_id) || []));
      }

      if (speakerSeatsRes.error) throw speakerSeatsRes.error;
      const allSeats: SpeakerSeat[] = [];
      for (let i = 1; i <= 10; i++) {
        const existingSeat = speakerSeatsRes.data?.find((s: SpeakerSeat) => s.seat_number === i);
        if (existingSeat) {
          allSeats.push(existingSeat);
        } else {
          allSeats.push({
            id: `empty-${i}`,
            show_id: show.id,
            seat_number: i,
            is_muted: false,
            joined_at: '',
          });
        }
      }
      setSpeakerSeats(allSeats);

      if (commentsRes.error) throw commentsRes.error;
      setComments(commentsRes.data || []);

      if (viewersRes.error) throw viewersRes.error;
      setViewers(viewersRes.data || []);
    } catch (error) {
      console.error('Error loading show data:', error);
    } finally {
      setLoading(false);
    }
  };

  const takeSeat = async () => {
    if (!user || userSeat) return;

    try {
      const availableSeats = await supabase
        .from('virtual_seats')
        .select('seat_number')
        .eq('show_id', show.id)
        .order('seat_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextSeatNumber = availableSeats.data ? availableSeats.data.seat_number + 1 : 1;

      if (nextSeatNumber > show.total_seats) {
        alert('Show is full!');
        return;
      }

      const { error } = await supabase
        .from('virtual_seats')
        .insert({
          show_id: show.id,
          user_id: user.id,
          seat_number: nextSeatNumber,
        });

      if (error) throw error;
      await loadShowData();
    } catch (error) {
      console.error('Error taking seat:', error);
      alert('Failed to join show');
    }
  };

  const leaveSeat = async () => {
    if (!userSeat) return;

    try {
      const { error } = await supabase
        .from('virtual_seats')
        .delete()
        .eq('id', userSeat.id);

      if (error) throw error;
      await loadShowData();
    } catch (error) {
      console.error('Error leaving seat:', error);
    }
  };

  const handleVote = async (participantId: string) => {
    if (!user || userVotes.has(participantId)) return;

    try {
      const { error } = await supabase
        .from('votes')
        .insert({
          participant_id: participantId,
          user_id: user.id,
          show_id: show.id,
        });

      if (error) throw error;
      setUserVotes(new Set([...userVotes, participantId]));
      await loadShowData();
    } catch (error) {
      console.error('Error voting:', error);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim()) return;

    try {
      const { error } = await supabase
        .from('show_comments')
        .insert({
          show_id: show.id,
          user_id: user.id,
          comment_text: newComment.trim(),
        });

      if (error) throw error;
      setNewComment('');
      await loadShowData();
    } catch (error) {
      console.error('Error posting comment:', error);
    }
  };

  const inviteToSpeakerSeat = async (viewerId: string, seatNumber: number) => {
    if (profile?.user_type !== 'admin') return;

    try {
      const { error } = await supabase
        .from('speaker_seats')
        .insert({
          show_id: show.id,
          seat_number: seatNumber,
          user_id: viewerId,
        });

      if (error) throw error;
      setShowInviteModal(false);
      await loadShowData();
    } catch (error) {
      console.error('Error inviting to speaker seat:', error);
    }
  };

  const removeSpeaker = async (seatId: string) => {
    if (profile?.user_type !== 'admin') return;

    try {
      const { error } = await supabase
        .from('speaker_seats')
        .delete()
        .eq('id', seatId);

      if (error) throw error;
      await loadShowData();
    } catch (error) {
      console.error('Error removing speaker:', error);
    }
  };

  const toggleMute = async (seatId: string, currentMuted: boolean) => {
    if (profile?.user_type !== 'admin') return;

    try {
      const { error } = await supabase
        .from('speaker_seats')
        .update({ is_muted: !currentMuted })
        .eq('id', seatId);

      if (error) throw error;
      await loadShowData();
    } catch (error) {
      console.error('Error toggling mute:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="bg-gradient-to-r from-red-600 to-orange-600 text-white p-4 sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl font-bold">{show.title}</h2>
              <div className="flex items-center gap-4 mt-1 text-sm">
                <div className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  <span>{viewerCount} viewers</span>
                </div>
                {show.status === 'live' && (
                  <div className="flex items-center gap-1 animate-pulse">
                    <span className="w-2 h-2 bg-white rounded-full"></span>
                    <span>LIVE</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {!userSeat ? (
            <button
              onClick={takeSeat}
              className="bg-white text-red-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-all"
            >
              Join Show
            </button>
          ) : (
            <button
              onClick={leaveSeat}
              className="bg-white/20 hover:bg-white/30 px-6 py-2 rounded-lg font-semibold transition-all"
            >
              Leave Show
            </button>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-purple-500/30 shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-white text-xl font-bold flex items-center gap-2">
                  <Mic className="w-6 h-6 text-purple-400" />
                  Stage Speakers
                </h3>
                {profile?.user_type === 'admin' && (
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 text-sm"
                  >
                    <UserPlus className="w-4 h-4" />
                    Invite Speaker
                  </button>
                )}
              </div>

              <div className="grid grid-cols-5 gap-4">
                {speakerSeats.map((seat) => (
                  <div
                    key={seat.seat_number}
                    className={`relative aspect-square rounded-xl flex flex-col items-center justify-center p-4 transition-all ${
                      seat.user_id
                        ? 'bg-gradient-to-br from-purple-600 to-pink-600 shadow-lg shadow-purple-500/50'
                        : 'bg-slate-700 border-2 border-dashed border-slate-600'
                    }`}
                  >
                    {seat.user_id ? (
                      <>
                        <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-2 backdrop-blur-sm">
                          <span className="text-white text-xl font-bold">
                            {seat.user_profiles?.full_name?.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <p className="text-white text-xs font-semibold text-center line-clamp-2">
                          {seat.user_profiles?.full_name}
                        </p>
                        {profile?.user_type === 'admin' && (
                          <div className="absolute top-2 right-2 flex gap-1">
                            <button
                              onClick={() => toggleMute(seat.id, seat.is_muted)}
                              className="bg-black/30 hover:bg-black/50 p-1 rounded transition-all"
                            >
                              {seat.is_muted ? (
                                <MicOff className="w-3 h-3 text-red-400" />
                              ) : (
                                <Mic className="w-3 h-3 text-green-400" />
                              )}
                            </button>
                            <button
                              onClick={() => removeSpeaker(seat.id)}
                              className="bg-black/30 hover:bg-black/50 p-1 rounded transition-all"
                            >
                              <X className="w-3 h-3 text-white" />
                            </button>
                          </div>
                        )}
                        {seat.is_muted && (
                          <div className="absolute bottom-2 left-2">
                            <MicOff className="w-4 h-4 text-red-400" />
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 bg-slate-600 rounded-full flex items-center justify-center mb-2">
                          <Users className="w-6 h-6 text-slate-500" />
                        </div>
                        <p className="text-slate-500 text-xs font-medium">Empty</p>
                      </>
                    )}
                    <div className="absolute top-2 left-2 bg-black/40 px-2 py-0.5 rounded text-xs text-white font-bold">
                      {seat.seat_number}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <h3 className="text-white text-lg font-bold mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                Live Voting
              </h3>
              <div className="space-y-3">
                {participants.map((participant, index) => (
                  <div
                    key={participant.id}
                    className="bg-slate-700 rounded-lg p-4 flex items-center justify-between hover:bg-slate-600 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                        index === 0 ? 'bg-yellow-500 text-white' :
                        index === 1 ? 'bg-gray-300 text-gray-800' :
                        index === 2 ? 'bg-orange-600 text-white' :
                        'bg-slate-600 text-white'
                      }`}>
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-white font-semibold">{participant.stage_name}</p>
                        <p className="text-gray-400 text-sm">{participant.total_votes} votes</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleVote(participant.id)}
                      disabled={userVotes.has(participant.id) || !userSeat}
                      className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 ${
                        userVotes.has(participant.id)
                          ? 'bg-green-600 text-white cursor-not-allowed'
                          : userSeat
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : 'bg-gray-600 text-gray-300 cursor-not-allowed'
                      }`}
                    >
                      <ThumbsUp className="w-4 h-4" />
                      {userVotes.has(participant.id) ? 'Voted' : 'Vote'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col" style={{ height: '600px' }}>
              <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-4">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  Live Chat
                </h3>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {comments.map((comment: any) => (
                  <div key={comment.id} className="bg-slate-700 rounded-lg p-3">
                    <p className="text-purple-400 text-sm font-semibold mb-1">
                      {comment.user_profiles?.full_name}
                    </p>
                    <p className="text-white text-sm">{comment.comment_text}</p>
                  </div>
                ))}
                <div ref={commentsEndRef} />
              </div>

              {userSeat ? (
                <form onSubmit={handlePostComment} className="p-4 bg-slate-900 border-t border-slate-700">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!newComment.trim()}
                      className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-all disabled:opacity-50"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-4 bg-slate-900 border-t border-slate-700">
                  <p className="text-gray-400 text-sm text-center">Join the show to chat</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showInviteModal && profile?.user_type === 'admin' && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white text-xl font-bold">Invite Speaker</h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-gray-400 text-sm mb-3">Select a viewer to invite to the stage:</p>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {viewers
                  .filter(v => !speakerSeats.find(s => s.user_id === v.user_id))
                  .map((viewer: any) => (
                    <div key={viewer.id} className="bg-slate-700 rounded-lg p-3">
                      <p className="text-white font-semibold mb-2">{viewer.user_profiles?.full_name}</p>
                      <div className="flex gap-2 flex-wrap">
                        {speakerSeats
                          .filter(s => !s.user_id)
                          .map((seat) => (
                            <button
                              key={seat.seat_number}
                              onClick={() => inviteToSpeakerSeat(viewer.user_id, seat.seat_number)}
                              className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm transition-all"
                            >
                              Seat {seat.seat_number}
                            </button>
                          ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
