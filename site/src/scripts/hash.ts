// URL の # の行き先の id。壊れた #（「#%」など）は ''（decodeURIComponent の例外で、1つにまとめた後ろのスクリプトまで止めないように）
export function hashId(hash = location.hash) {
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return '';
  }
}
