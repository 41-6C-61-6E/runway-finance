export function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Never';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 0) return 'Future';
  
  if (diffInSeconds < 60) {
    return `${diffInSeconds}s ago`;
  }
  
  if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes}m ago`;
  }
  
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}h ago`;
  }
  
  if (diffInSeconds < 2592000) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days}d ago`;
  }
  
  return date.toLocaleDateString();
}