import { getEvClient } from '../evClient';
import { useStore } from '../context';
import { Simulator } from '../../sim';

export function Play(_props: { query: URLSearchParams }) {
  const store = useStore();
  return (
    <div class="page page-wide">
      <h1>Play</h1>
      <Simulator mode="sandbox" settings={store.settings} evClient={getEvClient()} />
    </div>
  );
}
