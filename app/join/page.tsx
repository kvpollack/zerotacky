import JoinClient from './JoinClient';
import { canonical } from '@/lib/website/seo';

export const metadata = { title: 'Join a Meet | ZeroTacky', ...canonical('/join') };

export default function JoinPage() {
  return <JoinClient />;
}
