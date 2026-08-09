/** The slice of the Spotify Web API this app actually reads. */

export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  uri: string;
}

export type AlbumType = 'album' | 'single' | 'compilation';

export interface SpotifyAlbum {
  id: string;
  name: string;
  uri: string;
  album_type: AlbumType;
  total_tracks: number;
  release_date: string;
  /** Absent on some simplified album objects, so never assume it's there. */
  images?: SpotifyImage[];
  artists: SpotifyArtist[];
  label?: string;
  tracks?: Paged<SpotifyTrack>;
}

export interface SpotifyTrack {
  id: string | null;
  name: string;
  uri: string;
  duration_ms: number;
  track_number: number;
  disc_number: number;
  is_local?: boolean;
  artists: SpotifyArtist[];
  album?: SpotifyAlbum;
  /** Only asked for where a playlist may also hold episodes. */
  type?: 'track';
}

/**
 * A playlist can hold podcast episodes as well as tracks. They aren't music and
 * carry no album, so the import screen shows them and says so rather than
 * dropping a row the listener can see in Spotify.
 */
export interface SpotifyEpisode {
  id: string | null;
  name: string;
  uri: string;
  duration_ms: number;
  type: 'episode';
  /** The podcast it belongs to, which a row names in place of an artist. */
  show?: { name: string };
}

export interface Paged<T> {
  items: T[];
  next: string | null;
  total: number;
  limit: number;
  offset: number;
}

export interface SpotifyUser {
  id: string;
  display_name: string | null;
  email?: string;
  /** Only returned when `user-read-private` was granted; undefined otherwise. */
  product?: 'premium' | 'free' | 'open';
  /** Same scope, and the account's market — worth seeing when a write is refused. */
  country?: string;
  images?: SpotifyImage[];
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  external_urls: { spotify: string };
  tracks: { total: number };
  /** `display_name` is absent on some playlist objects; the id is always there. */
  owner: { id: string; display_name?: string | null };
  images?: SpotifyImage[];
}

/**
 * `track` is deprecated in favour of `item`; read both, prefer `item`.
 * See `playlistTrack()` in ./client.
 */
export interface PlaylistTrackObject {
  added_at: string;
  item?: SpotifyTrack | null;
  track?: SpotifyTrack | null;
}

/**
 * One row of a playlist the listener picked, rather than one of the seven the
 * board owns. Wider than `PlaylistTrackObject` because an arbitrary playlist can
 * hold episodes, which the board playlists never do.
 */
export interface PlaylistEntry {
  added_at: string;
  item?: SpotifyTrack | SpotifyEpisode | null;
  track?: SpotifyTrack | SpotifyEpisode | null;
}

export interface SavedAlbumObject {
  added_at: string;
  album: SpotifyAlbum;
}

export interface PlayHistoryObject {
  track: SpotifyTrack;
  played_at: string;
  context: { uri: string; type: string } | null;
}

export interface SpotifyDevice {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  volume_percent: number | null;
  /**
   * Spotify's words: "at present if this is true then no Web API commands will
   * be accepted by this device". Some car head units and speakers answer the
   * device list but refuse everything sent to them.
   */
  is_restricted?: boolean;
  /**
   * A private session plays, but Spotify keeps it out of listening history —
   * and history is the only place a pass can be counted from.
   */
  is_private_session?: boolean;
}

export interface PlaybackState {
  device: SpotifyDevice | null;
  timestamp: number;
  progress_ms: number | null;
  is_playing: boolean;
  shuffle_state: boolean;
  repeat_state: 'off' | 'track' | 'context';
  item: SpotifyTrack | null;
  context: { uri: string; type: string } | null;
}

export interface SearchResponse {
  albums?: Paged<SpotifyAlbum>;
}

export type TimeRange = 'short_term' | 'medium_term' | 'long_term';
