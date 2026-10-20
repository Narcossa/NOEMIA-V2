// Ouverture depuis Spotlight : un souvenir touché dans la recherche de l'iPhone
// est transformé en lien noemia://spotlight?id=…, que l'écran principal sait traiter.
import ExpoModulesCore
import CoreSpotlight
import UIKit

public class NoemiaAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, continue userActivity: NSUserActivity,
                          restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
    guard userActivity.activityType == CSSearchableItemActionType,
          let id = userActivity.userInfo?[CSSearchableItemActivityIdentifier] as? String else { return false }
    var c = URLComponents(string: "noemia://spotlight")!
    c.queryItems = [URLQueryItem(name: "id", value: id)]
    if let url = c.url { DispatchQueue.main.async { UIApplication.shared.open(url) } }
    return true
  }
}
