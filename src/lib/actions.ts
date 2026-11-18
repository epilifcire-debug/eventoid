import { DEMO_MODE } from './config';
import { toast } from '../components/ui';

/**
 * Ações de gravação desta etapa (frontend). Na demonstração, simulam o fluxo e avisam que nada foi gravado.
 * Fora da demonstração, não fingem sucesso: informam que a gravação depende da etapa de backend.
 */
export async function runAction(successMsg: string): Promise<boolean> {
  await new Promise((r) => setTimeout(r, 600));
  if (DEMO_MODE) { toast.success(`${successMsg} (demonstração — nada foi gravado)`); return true; }
  toast.info('Gravação disponível após a conexão com o backend.');
  return false;
}
