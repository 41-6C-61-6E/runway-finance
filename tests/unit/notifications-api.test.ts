import { vi, describe, it, expect, beforeEach } from 'vitest';
import { GET as getList, POST as readAll } from '@/app/api/notifications/route';
import { POST as markRead } from '@/app/api/notifications/[id]/read/route';
import { userNotifications } from '@/lib/db/schema';

// Mock auth
const mockAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: (...args: any[]) => mockAuth(...args),
}));

// Mocks database calls spied functions
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();

let mockResolvedVal: any = [];

const mockDb = {
  select: mockSelect,
  from: mockFrom,
  where: mockWhere,
  orderBy: mockOrderBy,
  limit: mockLimit,
  update: mockUpdate,
  set: mockSet,
  then: (onfulfilled?: (value: any) => any) => {
    return Promise.resolve(mockResolvedVal).then(onfulfilled);
  }
};

vi.mock('@/lib/db', () => ({
  getDb: () => mockDb,
}));

describe('Notifications API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mocks chain setup returning the database context for chaining
    mockSelect.mockReturnValue(mockDb);
    mockFrom.mockReturnValue(mockDb);
    mockWhere.mockReturnValue(mockDb);
    mockOrderBy.mockReturnValue(mockDb);
    mockLimit.mockReturnValue(mockDb);
    mockUpdate.mockReturnValue(mockDb);
    mockSet.mockReturnValue(mockDb);
    
    mockResolvedVal = [];
  });

  describe('GET /api/notifications', () => {
    it('should return 401 if unauthorized', async () => {
      mockAuth.mockResolvedValue(null);
      const res = await getList();
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('should return list of notifications for user', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
      const mockNotifs = [
        { id: 'n1', userId: 'user-1', title: 'N1', body: 'B1', isRead: false },
        { id: 'n2', userId: 'user-1', title: 'N2', body: 'B2', isRead: true }
      ];
      mockResolvedVal = mockNotifs;

      const res = await getList();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.notifications).toEqual(mockNotifs);
      
      expect(mockFrom).toHaveBeenCalledWith(userNotifications);
    });
  });

  describe('POST /api/notifications (read all)', () => {
    it('should return 401 if unauthorized', async () => {
      mockAuth.mockResolvedValue(null);
      const res = await readAll();
      expect(res.status).toBe(401);
    });

    it('should mark all notifications as read', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
      mockResolvedVal = { count: 2 };

      const res = await readAll();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      
      expect(mockUpdate).toHaveBeenCalledWith(userNotifications);
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ isRead: true }));
    });
  });

  describe('POST /api/notifications/[id]/read', () => {
    it('should return 401 if unauthorized', async () => {
      mockAuth.mockResolvedValue(null);
      const res = await markRead(new Request('http://localhost'), { params: Promise.resolve({ id: 'n1' }) });
      expect(res.status).toBe(401);
    });

    it('should mark single notification as read', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
      mockResolvedVal = { count: 1 };

      const res = await markRead(new Request('http://localhost'), { params: Promise.resolve({ id: 'n1' }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      
      expect(mockUpdate).toHaveBeenCalledWith(userNotifications);
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ isRead: true }));
    });
  });
});
