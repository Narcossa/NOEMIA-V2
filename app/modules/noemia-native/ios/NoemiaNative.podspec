require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'NoemiaNative'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/Narcossa/NOEMIA-V2.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ActivityKit', 'CoreSpotlight', 'MapKit', 'Security', 'Speech', 'AVFoundation'
  # Cadres iOS 26 : liés « faibles » pour que l'appli démarre aussi sur un iOS plus ancien
  s.weak_frameworks = 'AlarmKit', 'FoundationModels'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
