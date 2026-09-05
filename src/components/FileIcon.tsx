import type { DashboardFile, ExplorerFile, DriveFileItem } from '@/types';

type IconFile = DashboardFile | ExplorerFile | DriveFileItem;

export function DashboardFileIcon({ file }: { file: IconFile }) {
  if (file.type === 'folder') return <div className="file-icon">{'\u25B0'}</div>;
  if (file.type === 'pdf') return <div className="file-icon pdf">PDF</div>;
  if (file.type === 'zip') return <div className="file-icon zip">ZIP</div>;
  if (file.type === 'img') return <div className="file-icon img">IMG</div>;
  if (file.type === 'video') return <div className="file-icon">VID</div>;
  if (file.type === 'audio') return <div className="file-icon">AUD</div>;
  return <div className="file-icon">FILE</div>;
}

function isExplorerFile(f: IconFile): f is ExplorerFile {
  return 'parent' in f;
}

function isDriveFileItem(f: IconFile): f is DriveFileItem {
  return 'nodeId' in f && 'thumbnail' in f;
}

export function V3Icon({ file }: { file: IconFile }) {
  if (file.type === 'folder') return <span className="v3-icon v3-folder">{'\u{1F4C1}'}</span>;

  if (isDriveFileItem(file) && file.type === 'img' && file.thumbnail) {
    return <img className="v3-media-icon" src={file.thumbnail} alt="" />;
  }
  if (isExplorerFile(file) && file.type === 'img' && file.preview) {
    return <img className="v3-media-icon" src={file.preview} alt="" />;
  }
  if (file.type === 'img') return <span className="v3-icon v3-image">{'\u{1F5BC}\uFE0F'}</span>;

  if (isExplorerFile(file) && file.type === 'video' && file.preview) return (
    <span className="v3-video-thumb">
      <img src={file.preview} alt="" />
      <span className="v3-play">{'\u25B6'}</span>
    </span>
  );
  if (file.type === 'video') return <span className="v3-icon v3-video">{'\u{1F3AC}'}</span>;
  if (file.type === 'pdf') return <span className="v3-icon v3-pdf">PDF</span>;
  if (file.type === 'audio') return <span className="v3-icon v3-audio">{'\u266B'}</span>;
  if (file.type === 'zip') return <span className="v3-icon v3-archive">ZIP</span>;
  return <span className="v3-icon v3-file">{'\u{1F4C4}'}</span>;
}
