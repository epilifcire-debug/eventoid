import { cx } from '../../lib/format';

/**
 * Assinatura EFCsys. Fallback textual fixo; a versão gráfica (upload, visibilidade e link)
 * é configurada pelo Administrador Master em Configurações → Assinatura EFCSYS.
 */
export function EfcsysSignature({ className }: { className?: string }) {
  return <p className={cx('leading-relaxed', className)}>Desenvolvido por EFCsys • Todos os direitos reservados.</p>;
}
