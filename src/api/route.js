const routeObject = uniCloud.importObject('route');

export async function planDriveRoute(params = {}) {
  return routeObject.drive(params);
}
