const recommendObject = uniCloud.importObject('recommend');

export async function recommendHome(params = {}) {
  return recommendObject.home(params);
}
