import { Link } from 'react-router-dom';
import { Button, EmptyState } from '../components/ui';

export default function NotFoundPage() {
  return (
    <EmptyState
      title="We couldn't find that page"
      message="It may have been moved. Use the menu on the left, or go back to the dashboard."
      action={
        <Link to="/">
          <Button>Go to Dashboard</Button>
        </Link>
      }
    />
  );
}
