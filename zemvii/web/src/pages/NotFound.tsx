import { Compass } from 'lucide-react';
import { Link } from '../lib/router.tsx';
import { Empty } from '../components/ui.tsx';

export function NotFound() {
  return (
    <Empty icon={<Compass size={26} />} title="This page doesn't exist" action={<Link to="/home" className="btn btn-primary">Go home</Link>}>
      The link may be old, or the address has a typo.
    </Empty>
  );
}
