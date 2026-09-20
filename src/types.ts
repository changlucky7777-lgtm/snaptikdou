export interface TikTokAuthor {
  id: string;
  uniqueId: string;
  nickname: string;
  avatar: string;
}

export interface TikTokStats {
  plays: number;
  likes: number;
  comments: number;
  shares: number;
  downloads: number;
}

export interface TikTokVideo {
  noWatermark: string;
  hd: string;
  watermark?: string;
  size?: number;
  hdSize?: number;
  backupUrls?: string[];
}

export interface TikTokAudio {
  id: string;
  title: string;
  author: string;
  url: string;
  duration?: number;
}

export interface TikTokMediaItem {
  id: string;
  url: string;
  title: string;
  mediaType: 'video' | 'photos';
  cover: string;
  duration: number;
  createdAt: string;
  author: TikTokAuthor;
  stats: TikTokStats;
  video: TikTokVideo;
  audio: TikTokAudio;
  images: string[];
  platform?: 'tiktok' | 'douyin';
  isPartial?: boolean;
  warning?: string;
}

export interface PathConfig {
  rootFolder: string;
  pattern: string; // e.g. "{root}/@{author}/{type}/{title}_{id}.{ext}"
  photoPattern: string; // e.g. "{root}/@{author}/photos/{title}_{id}_slide_{index}.{ext}"
  audioPattern: string; // e.g. "{root}/@{author}/audio/{title}_{id}.mp3"
  maxTitleLength: number;
  dateFormat: 'YYYY-MM-DD' | 'YYYYMMDD' | 'DD-MM-YYYY';
  autoCreateChannelFolder: boolean;
}

export interface HistoryRecord {
  id: string;
  mediaId: string;
  title: string;
  cover: string;
  authorUniqueId: string;
  authorNickname: string;
  mediaType: 'video' | 'photos' | 'audio';
  downloadedAt: string;
  fileSizeEstimate?: string;
  savedPath: string;
  sourceUrl: string;
  downloadType: 'video_hd' | 'video_sd' | 'audio' | 'photos_zip' | 'one_click_all' | 'photo_single';
}

export interface AudioProgressState {
  currentMB: string;
  totalMB: string;
  percent: number;
  isPaused: boolean;
}
