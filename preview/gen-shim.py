# Regenerates preview/lucide-shim.tsx from lucide-react imports in src/ (preview build only).
import re, glob, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
names = set()
for f in glob.glob(f'{root}/src/**/*.ts*', recursive=True):
    for m in re.finditer(r'import \{([^}]+)\} from "lucide-react"', open(f).read()):
        for n in m.group(1).split(','):
            n = n.strip().split(' as ')[0].strip()
            if n: names.add(n)
d = open('/opt/npm-tools/node_modules/react-icons/lu/index.d.ts').read()
alias = {'AlertTriangle': 'TriangleAlert', 'BarChart3': 'ChartColumn'}
mp = {n: alias.get(n, n) for n in sorted(names)}
missing = [n for n, b in mp.items() if f'export declare const Lu{b}:' not in d]
assert not missing, missing
head = '// Preview-only: maps lucide-react names to react-icons\' Lucide set (lucide-react isn\'t installable offline here).\n'
body = '''type P = { size?: number; strokeWidth?: number; className?: string; fill?: string };
type C = React.ComponentType<Record<string, unknown>>;
const wrap = (I: unknown) => {
  const Icon = I as C;
  return function W({ size = 24, strokeWidth, className, fill }: P) {
    return <Icon size={size} className={className} {...(strokeWidth ? { strokeWidth } : {})} {...(fill ? { fill } : {})} />;
  };
};
'''
imp = ', '.join(sorted({'Lu' + b for b in mp.values()}))
exp = ''.join(f'export const {n} = wrap(Lu{b});\n' for n, b in mp.items())
open(f'{root}/preview/lucide-shim.tsx', 'w').write(head + 'import { ' + imp + ' } from "react-icons/lu";\n' + body + exp)
