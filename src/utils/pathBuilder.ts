import { PathConfig, TikTokMediaItem } from '../types';

export const DEFAULT_PATH_CONFIG: PathConfig = {
  rootFolder: 'TikTok_Downloads',
  pattern: '{root}/@{author}/{type}/{title}_{id}.{ext}',
  photoPattern: '{root}/@{author}/photos/{title}_{id}_slide_{index}.{ext}',
  audioPattern: '{root}/@{author}/audio/{title}_{id}.mp3',
  maxTitleLength: 40,
  dateFormat: 'YYYY-MM-DD',
  autoCreateChannelFolder: true,
};

export interface PathPreset {
  id: string;
  name: string;
  description: string;
  pattern: string;
  photoPattern: string;
  audioPattern: string;
}

export const PATH_PRESETS: PathPreset[] = [
  {
    id: 'channel_first',
    name: 'Tự động theo Kênh TikTok (Chuẩn)',
    description: 'Phân loại theo Tên kênh -> Thư mục Video / Audio / Photos',
    pattern: '{root}/@{author}/{type}/{title}_{id}.{ext}',
    photoPattern: '{root}/@{author}/photos/{title}_{id}_slide_{index}.{ext}',
    audioPattern: '{root}/@{author}/audio/{title}_{id}.mp3',
  },
  {
    id: 'date_channel',
    name: 'Theo Ngày tháng & Kênh',
    description: 'Sắp xếp theo Năm-Tháng -> Tên kênh -> File',
    pattern: '{root}/{year}-{month}/@{author}/{type}_{title}_{id}.{ext}',
    photoPattern: '{root}/{year}-{month}/@{author}/photos/{title}_{id}_slide_{index}.{ext}',
    audioPattern: '{root}/{year}-{month}/@{author}/audio/{title}_{id}.mp3',
  },
  {
    id: 'media_type_first',
    name: 'Phân loại theo Định dạng (Media Type)',
    description: 'Tách biệt thư mục videos / audios / photos ở cấp cao nhất',
    pattern: '{root}/{type}/@{author}/{title}_{id}.{ext}',
    photoPattern: '{root}/photos/@{author}/{id}/slide_{index}.{ext}',
    audioPattern: '{root}/audio/@{author}/{title}_{id}.mp3',
  },
  {
    id: 'flat_clean',
    name: 'Tối giản (Flat Folder)',
    description: 'Tất cả file lưu chung thư mục, tên file chứa tên kênh',
    pattern: '{root}/@{author}_{type}_{title}_{id}.{ext}',
    photoPattern: '{root}/@{author}_photos_{title}_{id}_{index}.{ext}',
    audioPattern: '{root}/@{author}_audio_{title}_{id}.mp3',
  },
  {
    id: 'custom_blank',
    name: 'Tự do cấu hình từ con số 0',
    description: 'Tự thiết lập cú pháp và cấu trúc thư mục hoàn toàn theo ý bạn',
    pattern: '{root}/@{author}/{type}/{title}_{id}.{ext}',
    photoPattern: '{root}/@{author}/photos/{title}_{id}_slide_{index}.{ext}',
    audioPattern: '{root}/@{author}/audio/{title}_{id}.mp3',
  },
];

export const AVAILABLE_TOKENS = [
  { token: '{root}', label: 'Thư mục gốc', desc: 'Thư mục lưu chính (ví dụ: TikTok_Downloads hoặc D:/Media)' },
  { token: '{author}', label: 'Tên kênh (@username)', desc: 'ID định danh người dùng TikTok (@username)' },
  { token: '{nickname}', label: 'Tên hiển thị', desc: 'Tên kênh hiển thị của tác giả' },
  { token: '{type}', label: 'Loại media', desc: 'video / audio / photos' },
  { token: '{title}', label: 'Tiêu đề bài viết', desc: 'Caption hoặc tiêu đề được làm sạch' },
  { token: '{id}', label: 'ID bài viết', desc: 'Mã số định danh của video/ảnh TikTok' },
  { token: '{date}', label: 'Ngày tháng (YYYY-MM-DD)', desc: 'Ngày đăng bài' },
  { token: '{year}', label: 'Năm (YYYY)', desc: 'Năm đăng bài' },
  { token: '{month}', label: 'Tháng (MM)', desc: 'Tháng đăng bài' },
  { token: '{day}', label: 'Ngày (DD)', desc: 'Ngày đăng bài' },
  { token: '{resolution}', label: 'Độ phân giải', desc: 'HD hoặc SD' },
  { token: '{index}', label: 'Số thứ tự ảnh', desc: '01, 02, 03... cho photo slide' },
  { token: '{ext}', label: 'Đuôi tệp', desc: 'mp4 / mp3 / jpg' },
];

export function sanitizeSegment(str: string): string {
  if (!str) return 'untitled';
  return str
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim();
}

export function sanitizeTitle(rawTitle: string, maxLength = 40): string {
  if (!rawTitle) return 'tiktok_post';
  let cleaned = rawTitle
    .replace(/#[\w\u00C0-\u024F\u1E00-\u1EFF]+/g, '') // remove hashtags from filename
    .replace(/@[\w.]+/g, '') // remove @mentions
    .replace(/[<>:"/\\|?*\n\r\t]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength).replace(/_+$/g, '');
  }
  return cleaned || 'tiktok_post';
}

export function buildFilePath(
  media: TikTokMediaItem,
  config: PathConfig,
  options: {
    mediaType: 'video' | 'audio' | 'photos';
    resolution?: 'HD' | 'SD';
    index?: number;
    extension?: string;
  }
): { fullPath: string; relativePath: string; filename: string; directory: string } {
  const { mediaType, resolution = 'HD', index = 1, extension } = options;

  let chosenPattern = config.pattern;
  if (mediaType === 'photos') {
    chosenPattern = config.photoPattern || config.pattern;
  } else if (mediaType === 'audio') {
    chosenPattern = config.audioPattern || config.pattern;
  }

  const defaultExt = mediaType === 'video' ? 'mp4' : mediaType === 'audio' ? 'mp3' : 'jpg';
  const ext = extension || defaultExt;

  const dateObj = media.createdAt ? new Date(media.createdAt) : new Date();
  const year = String(dateObj.getFullYear());
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');

  let formattedDate = `${year}-${month}-${day}`;
  if (config.dateFormat === 'YYYYMMDD') {
    formattedDate = `${year}${month}${day}`;
  } else if (config.dateFormat === 'DD-MM-YYYY') {
    formattedDate = `${day}-${month}-${year}`;
  }

  const authorSafe = sanitizeSegment(media.author?.uniqueId || 'tiktok_creator');
  const nicknameSafe = sanitizeSegment(media.author?.nickname || 'creator');
  const titleSafe = sanitizeTitle(media.title, config.maxTitleLength);
  const idSafe = sanitizeSegment(media.id || '0');
  const indexStr = String(index).padStart(2, '0');
  const rootSafe = config.rootFolder.replace(/[\\/]+$/, '').trim() || 'TikTok_Downloads';

  // Replace tokens
  let evaluated = chosenPattern
    .replace(/\{root\}/g, rootSafe)
    .replace(/\{author\}/g, authorSafe)
    .replace(/\{nickname\}/g, nicknameSafe)
    .replace(/\{type\}/g, mediaType)
    .replace(/\{date\}/g, formattedDate)
    .replace(/\{year\}/g, year)
    .replace(/\{month\}/g, month)
    .replace(/\{day\}/g, day)
    .replace(/\{title\}/g, titleSafe)
    .replace(/\{id\}/g, idSafe)
    .replace(/\{resolution\}/g, resolution)
    .replace(/\{index\}/g, indexStr)
    .replace(/\{ext\}/g, ext);

  // Normalize path separators to standard forward slashes for internal use
  const normalized = evaluated.replace(/\\/g, '/').replace(/\/+/g, '/');

  // Relative path (without the root folder prefix) for ZIP archives or local folder picker
  let relativePath = normalized;
  if (relativePath.startsWith(rootSafe + '/')) {
    relativePath = relativePath.slice(rootSafe.length + 1);
  } else if (relativePath.startsWith(rootSafe)) {
    relativePath = relativePath.slice(rootSafe.length);
  }
  relativePath = relativePath.replace(/^\/+/, '');

  const lastSlashIndex = normalized.lastIndexOf('/');
  const filename = lastSlashIndex !== -1 ? normalized.slice(lastSlashIndex + 1) : normalized;
  const directory = lastSlashIndex !== -1 ? normalized.slice(0, lastSlashIndex) : '';

  return {
    fullPath: normalized,
    relativePath,
    filename,
    directory,
  };
}
