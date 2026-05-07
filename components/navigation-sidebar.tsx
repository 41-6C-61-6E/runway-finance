import NavigationMenu from '@/components/navigation-menu';
import UserSection from '@/components/user-section';

export default function NavigationSidebar() {
  return (
    <aside className="fixed left-0 top-0 z-20 h-screen w-64 p-6 bg-black/20 backdrop-blur-md border-r border-white/10 flex flex-col justify-between">
      <div className="space-y-6">


        {/* Navigation Links */}
        <NavigationMenu />
      </div>

      {/* User Section */}
      <UserSection />
    </aside>
  );
}
