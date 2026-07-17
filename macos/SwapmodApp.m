#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface ProcessRunner : NSObject
@property (nonatomic, strong, readonly) NSURL *appRootURL;
@property (nonatomic, strong, readonly) NSURL *launcherURL;
@property (nonatomic, strong, readonly) NSURL *runtimeURL;
@property (nonatomic, strong, readonly) NSURL *embeddedHeadlessRuntimeURL;
@property (nonatomic, strong, readonly) NSURL *slicerCLIURL;
@property (nonatomic, strong, readonly) NSURL *nativeSlicerCLIURL;
- (nullable NSURL *)launchServerReturningError:(NSError **)error;
- (nullable NSURL *)sliceProjectAtURL:(NSURL *)projectURL error:(NSError **)error;
- (nullable NSURL *)sliceProjectWithNativeEngineAtURL:(NSURL *)projectURL error:(NSError **)error;
- (NSDictionary *)engineStatus;
- (void)stopServer;
@end

@interface AppDelegate : NSObject <NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler>
@property (nonatomic, strong) NSWindow *window;
@property (nonatomic, strong) WKWebView *webView;
@property (nonatomic, strong) NSTextField *loadingLabel;
@property (nonatomic, strong) NSTextField *helperLabel;
@property (nonatomic, strong) NSURL *serverURL;
@property (nonatomic, strong) NSURL *bundleIndexURL;
@property (nonatomic, strong) ProcessRunner *processRunner;
@end

@implementation ProcessRunner

- (instancetype)init {
    self = [super init];
    if (!self) {
        return nil;
    }

    NSURL *resourcesURL = [NSBundle mainBundle].resourceURL;
    _appRootURL = [resourcesURL URLByAppendingPathComponent:@"Support" isDirectory:YES];
    _launcherURL = [_appRootURL URLByAppendingPathComponent:@"tools/serve_swapmod.py"];
    _embeddedHeadlessRuntimeURL = [_appRootURL URLByAppendingPathComponent:@"engines/headless" isDirectory:YES];
    _slicerCLIURL = [_appRootURL URLByAppendingPathComponent:@"tools/swapmod_slicer.py"];
    _nativeSlicerCLIURL = [_appRootURL URLByAppendingPathComponent:@"tools/swapmod_native_slicer.py"];

    NSArray<NSURL *> *appSupport = [[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask];
    NSURL *baseRuntimeURL = [[appSupport firstObject] URLByAppendingPathComponent:@"SwapmodLocal" isDirectory:YES];
    _runtimeURL = [baseRuntimeURL URLByAppendingPathComponent:@"Runtime" isDirectory:YES];
    [[NSFileManager defaultManager] createDirectoryAtURL:_runtimeURL withIntermediateDirectories:YES attributes:nil error:nil];

    return self;
}

- (NSDictionary *)environment {
    NSMutableDictionary *environment = [NSMutableDictionary dictionaryWithDictionary:[NSProcessInfo processInfo].environment];
    environment[@"SWAPMOD_ROOT_DIR"] = self.appRootURL.path;
    environment[@"SWAPMOD_RUNTIME_DIR"] = self.runtimeURL.path;
    return environment;
}

- (NSString *)runPythonArguments:(NSArray<NSString *> *)arguments error:(NSError **)error {
    NSTask *task = [NSTask new];
    task.executableURL = [NSURL fileURLWithPath:@"/usr/bin/python3"];
    task.arguments = arguments;
    task.environment = [self environment];

    NSPipe *stdoutPipe = [NSPipe pipe];
    NSPipe *stderrPipe = [NSPipe pipe];
    task.standardOutput = stdoutPipe;
    task.standardError = stderrPipe;

    if (![task launchAndReturnError:error]) {
        return nil;
    }

    [task waitUntilExit];

    NSData *stdoutData = [stdoutPipe.fileHandleForReading readDataToEndOfFile];
    NSData *stderrData = [stderrPipe.fileHandleForReading readDataToEndOfFile];
    NSString *stdoutString = [[NSString alloc] initWithData:stdoutData encoding:NSUTF8StringEncoding] ?: @"";
    NSString *stderrString = [[NSString alloc] initWithData:stderrData encoding:NSUTF8StringEncoding] ?: @"";
    NSString *merged = [[@[stdoutString, stderrString] filteredArrayUsingPredicate:[NSPredicate predicateWithBlock:^BOOL(NSString *evaluatedObject, NSDictionary<NSString *,id> * _Nullable bindings) {
        return evaluatedObject.length > 0;
    }]] componentsJoinedByString:@"\n"];

    if (task.terminationStatus != 0) {
        if (error) {
            *error = [NSError errorWithDomain:@"SwapmodLocal" code:task.terminationStatus userInfo:@{
                NSLocalizedDescriptionKey: merged.length ? merged : @"Server launcher failed."
            }];
        }
        return nil;
    }

    return merged;
}

- (nullable NSDictionary *)headlessManifest {
    NSURL *manifestURL = [self.embeddedHeadlessRuntimeURL URLByAppendingPathComponent:@"engine.json"];
    NSData *data = [NSData dataWithContentsOfURL:manifestURL];
    if (!data) {
        return nil;
    }

    id object = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    if (![object isKindOfClass:[NSDictionary class]]) {
        return nil;
    }

    return (NSDictionary *)object;
}

- (unsigned long long)directorySizeAtURL:(NSURL *)url {
    unsigned long long total = 0;
    NSDirectoryEnumerator *enumerator = [[NSFileManager defaultManager] enumeratorAtURL:url
                                                              includingPropertiesForKeys:@[NSURLIsDirectoryKey, NSURLFileSizeKey]
                                                                                 options:0
                                                                            errorHandler:nil];
    for (NSURL *fileURL in enumerator) {
        NSDictionary *fileValues = [fileURL resourceValuesForKeys:@[NSURLIsDirectoryKey, NSURLFileSizeKey] error:nil];
        NSNumber *isDirectory = fileValues[NSURLIsDirectoryKey];
        NSNumber *fileSize = fileValues[NSURLFileSizeKey];
        if (!isDirectory.boolValue) {
            total += fileSize.unsignedLongLongValue;
        }
    }
    return total;
}

- (NSDictionary *)engineStatus {
    NSDictionary *manifest = [self headlessManifest];
    NSString *embeddedExecutable = @"";
    BOOL hasEmbedded = NO;
    unsigned long long embeddedSize = 0;

    if (manifest) {
        NSString *relativeExecutable = manifest[@"executable"];
        NSURL *executableURL = [self.embeddedHeadlessRuntimeURL URLByAppendingPathComponent:relativeExecutable ?: @""];
        embeddedExecutable = executableURL.path ?: @"";
        hasEmbedded = [[NSFileManager defaultManager] fileExistsAtPath:embeddedExecutable];
        if (hasEmbedded) {
            embeddedSize = [self directorySizeAtURL:self.embeddedHeadlessRuntimeURL];
        }
    }

    NSString *systemExecutable = @"/Applications/BambuStudio.app/Contents/MacOS/BambuStudio";
    BOOL hasSystem = [[NSFileManager defaultManager] fileExistsAtPath:systemExecutable];
    NSString *activePath = hasEmbedded ? embeddedExecutable : (hasSystem ? systemExecutable : @"");

    return @{
        @"hasEmbedded": @(hasEmbedded),
        @"hasSystem": @(hasSystem),
        @"embeddedPath": embeddedExecutable,
        @"systemPath": systemExecutable,
        @"activePath": activePath,
        @"embeddedSize": @(embeddedSize),
        @"engineKind": manifest[@"engine_kind"] ?: @"",
        @"engineName": manifest[@"engine_name"] ?: @""
    };
}

- (nullable NSURL *)launchServerReturningError:(NSError **)error {
    if (![[NSFileManager defaultManager] fileExistsAtPath:self.launcherURL.path]) {
        if (error) {
            *error = [NSError errorWithDomain:@"SwapmodLocal" code:2 userInfo:@{
                NSLocalizedDescriptionKey: @"Embedded web resources are missing from the app bundle."
            }];
        }
        return nil;
    }

    NSString *output = [self runPythonArguments:@[self.launcherURL.path, @"launch", @"--no-browser"] error:error];
    if (!output) {
        return nil;
    }

    __block NSString *urlCandidate = nil;
    [[output componentsSeparatedByCharactersInSet:[NSCharacterSet newlineCharacterSet]] enumerateObjectsUsingBlock:^(NSString * _Nonnull line, NSUInteger idx, BOOL * _Nonnull stop) {
        NSRange range = [line rangeOfString:@"http://127.0.0.1:"];
        if (range.location != NSNotFound) {
            urlCandidate = [line substringFromIndex:range.location];
            *stop = YES;
        }
    }];

    if (!urlCandidate) {
        if (error) {
            *error = [NSError errorWithDomain:@"SwapmodLocal" code:3 userInfo:@{
                NSLocalizedDescriptionKey: output
            }];
        }
        return nil;
    }

    return [NSURL URLWithString:[urlCandidate stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]]];
}

- (nullable NSURL *)sliceProjectAtURL:(NSURL *)projectURL error:(NSError **)error {
    NSString *projectName = projectURL.lastPathComponent ?: @"project.3mf";
    NSString *lowerName = projectName.lowercaseString;
    if ([lowerName hasSuffix:@".gcode.3mf"]) {
        return projectURL;
    }

    if (![[NSFileManager defaultManager] fileExistsAtPath:self.slicerCLIURL.path]) {
        if (error) {
            *error = [NSError errorWithDomain:@"SwapmodLocal" code:10 userInfo:@{
                NSLocalizedDescriptionKey: @"Le wrapper CLI de slicing est introuvable dans le bundle."
            }];
        }
        return nil;
    }

    NSString *baseName = [projectName hasSuffix:@".3mf"]
        ? [projectName substringToIndex:projectName.length - 4]
        : projectName;
    NSString *outputName = [baseName stringByAppendingString:@".gcode.3mf"];

    NSURL *jobDir = [self.runtimeURL URLByAppendingPathComponent:[[NSUUID UUID] UUIDString] isDirectory:YES];
    [[NSFileManager defaultManager] createDirectoryAtURL:jobDir withIntermediateDirectories:YES attributes:nil error:nil];

    NSString *merged = [self runPythonArguments:@[
        self.slicerCLIURL.path,
        @"slice",
        @"--input", projectURL.path,
        @"--output-dir", jobDir.path,
        @"--output-name", outputName,
        @"--json"
    ] error:error];
    if (!merged) {
        return nil;
    }

    NSURL *outputURL = [jobDir URLByAppendingPathComponent:outputName];
    if (![[NSFileManager defaultManager] fileExistsAtPath:outputURL.path]) {
        if (error) {
            *error = [NSError errorWithDomain:@"SwapmodLocal" code:11 userInfo:@{
                NSLocalizedDescriptionKey: merged.length ? merged : @"Le slicing automatique a echoue."
            }];
        }
        return nil;
    }

    return outputURL;
}

- (nullable NSURL *)sliceProjectWithNativeEngineAtURL:(NSURL *)projectURL error:(NSError **)error {
    if (![[NSFileManager defaultManager] fileExistsAtPath:self.nativeSlicerCLIURL.path]) {
        if (error) {
            *error = [NSError errorWithDomain:@"SwapmodLocal" code:12 userInfo:@{
                NSLocalizedDescriptionKey: @"Le slicer natif est introuvable dans le bundle."
            }];
        }
        return nil;
    }

    NSString *projectName = projectURL.lastPathComponent ?: @"project.3mf";
    NSString *baseName = [projectName hasSuffix:@".3mf"]
        ? [projectName substringToIndex:projectName.length - 4]
        : [projectName stringByDeletingPathExtension];
    NSString *outputName = [baseName stringByAppendingString:@".gcode"];

    NSURL *jobDir = [self.runtimeURL URLByAppendingPathComponent:[[NSUUID UUID] UUIDString] isDirectory:YES];
    [[NSFileManager defaultManager] createDirectoryAtURL:jobDir withIntermediateDirectories:YES attributes:nil error:nil];
    NSURL *outputURL = [jobDir URLByAppendingPathComponent:outputName];

    NSString *merged = [self runPythonArguments:@[
        self.nativeSlicerCLIURL.path,
        @"slice-gcode",
        @"--input", projectURL.path,
        @"--output", outputURL.path,
        @"--layer-height", @"0.2",
        @"--first-layer-height", @"0.2"
    ] error:error];
    if (!merged) {
        return nil;
    }

    if (![[NSFileManager defaultManager] fileExistsAtPath:outputURL.path]) {
        if (error) {
            *error = [NSError errorWithDomain:@"SwapmodLocal" code:13 userInfo:@{
                NSLocalizedDescriptionKey: merged.length ? merged : @"Le slicer natif n'a pas genere de G-code."
            }];
        }
        return nil;
    }

    return outputURL;
}

- (void)stopServer {
    [self runPythonArguments:@[self.launcherURL.path, @"stop"] error:nil];
}

@end

@implementation AppDelegate

- (instancetype)init {
    self = [super init];
    if (!self) {
        return nil;
    }

    _processRunner = [ProcessRunner new];
    return self;
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
    [self createWindow];
    [self loadBundledUI];
    [NSApp activateIgnoringOtherApps:YES];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}

- (void)applicationWillTerminate:(NSNotification *)notification {
    [self.processRunner stopServer];
}

- (void)createWindow {
    NSRect rect = NSMakeRect(0, 0, 1380, 940);
    self.window = [[NSWindow alloc] initWithContentRect:rect
                                              styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable)
                                                backing:NSBackingStoreBuffered
                                                  defer:NO];
    [self.window center];
    self.window.title = @"Swapmod Local";
    self.window.minSize = NSMakeSize(1080, 720);

    NSView *contentView = [[NSView alloc] initWithFrame:rect];
    contentView.wantsLayer = YES;
    contentView.layer.backgroundColor = [[NSColor colorWithCalibratedRed:0.95 green:0.93 blue:0.89 alpha:1.0] CGColor];
    self.window.contentView = contentView;

    NSVisualEffectView *header = [NSVisualEffectView new];
    header.material = NSVisualEffectMaterialSidebar;
    header.blendingMode = NSVisualEffectBlendingModeWithinWindow;
    header.state = NSVisualEffectStateActive;
    header.wantsLayer = YES;
    header.layer.cornerRadius = 22;
    header.translatesAutoresizingMaskIntoConstraints = NO;

    NSTextField *titleField = [NSTextField labelWithString:@"Swapmod Local"];
    titleField.font = [NSFont systemFontOfSize:24 weight:NSFontWeightBold];
    titleField.textColor = [NSColor colorWithCalibratedRed:0.12 green:0.14 blue:0.13 alpha:1.0];
    titleField.translatesAutoresizingMaskIntoConstraints = NO;

    self.helperLabel = [NSTextField labelWithString:@"Loading bundled app..."];
    self.helperLabel.font = [NSFont systemFontOfSize:13 weight:NSFontWeightMedium];
    self.helperLabel.textColor = [NSColor colorWithCalibratedRed:0.35 green:0.40 blue:0.39 alpha:1.0];
    self.helperLabel.translatesAutoresizingMaskIntoConstraints = NO;

    WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
    configuration.websiteDataStore = [WKWebsiteDataStore nonPersistentDataStore];
    [configuration.userContentController addScriptMessageHandler:self name:@"swapmodApp"];
    self.webView = [[WKWebView alloc] initWithFrame:NSZeroRect configuration:configuration];
    self.webView.navigationDelegate = self;
    self.webView.UIDelegate = self;
    self.webView.translatesAutoresizingMaskIntoConstraints = NO;
    self.webView.hidden = YES;
    self.webView.wantsLayer = YES;
    self.webView.layer.cornerRadius = 22;
    self.webView.layer.masksToBounds = YES;

    self.loadingLabel = [NSTextField labelWithString:@"Loading app..."];
    self.loadingLabel.font = [NSFont systemFontOfSize:18 weight:NSFontWeightSemibold];
    self.loadingLabel.textColor = [NSColor colorWithCalibratedRed:0.10 green:0.43 blue:0.34 alpha:1.0];
    self.loadingLabel.alignment = NSTextAlignmentCenter;
    self.loadingLabel.translatesAutoresizingMaskIntoConstraints = NO;

    NSButton *addFilesButton = [self makeHeaderButtonWithTitle:@"Add Files" action:@selector(addFiles:)];
    NSButton *aboutButton = [self makeHeaderButtonWithTitle:@"A propos" action:@selector(showAboutPanel:)];
    NSButton *openBrowserButton = [self makeHeaderButtonWithTitle:@"Open in Browser" action:@selector(openInBrowser:)];
    NSButton *reloadButton = [self makeHeaderButtonWithTitle:@"Reload" action:@selector(reloadPage:)];

    [contentView addSubview:header];
    [header addSubview:titleField];
    [header addSubview:self.helperLabel];
    [header addSubview:addFilesButton];
    [header addSubview:aboutButton];
    [header addSubview:openBrowserButton];
    [header addSubview:reloadButton];
    [contentView addSubview:self.webView];
    [contentView addSubview:self.loadingLabel];

    [NSLayoutConstraint activateConstraints:@[
        [header.topAnchor constraintEqualToAnchor:contentView.topAnchor constant:18],
        [header.leadingAnchor constraintEqualToAnchor:contentView.leadingAnchor constant:18],
        [header.trailingAnchor constraintEqualToAnchor:contentView.trailingAnchor constant:-18],
        [header.heightAnchor constraintEqualToConstant:72],

        [titleField.leadingAnchor constraintEqualToAnchor:header.leadingAnchor constant:20],
        [titleField.topAnchor constraintEqualToAnchor:header.topAnchor constant:16],

        [self.helperLabel.leadingAnchor constraintEqualToAnchor:titleField.leadingAnchor],
        [self.helperLabel.topAnchor constraintEqualToAnchor:titleField.bottomAnchor constant:4],

        [reloadButton.trailingAnchor constraintEqualToAnchor:header.trailingAnchor constant:-18],
        [reloadButton.centerYAnchor constraintEqualToAnchor:header.centerYAnchor],

        [openBrowserButton.trailingAnchor constraintEqualToAnchor:reloadButton.leadingAnchor constant:-10],
        [openBrowserButton.centerYAnchor constraintEqualToAnchor:header.centerYAnchor],

        [aboutButton.trailingAnchor constraintEqualToAnchor:openBrowserButton.leadingAnchor constant:-10],
        [aboutButton.centerYAnchor constraintEqualToAnchor:header.centerYAnchor],

        [addFilesButton.trailingAnchor constraintEqualToAnchor:aboutButton.leadingAnchor constant:-10],
        [addFilesButton.centerYAnchor constraintEqualToAnchor:header.centerYAnchor],

        [self.webView.topAnchor constraintEqualToAnchor:header.bottomAnchor constant:16],
        [self.webView.leadingAnchor constraintEqualToAnchor:contentView.leadingAnchor constant:18],
        [self.webView.trailingAnchor constraintEqualToAnchor:contentView.trailingAnchor constant:-18],
        [self.webView.bottomAnchor constraintEqualToAnchor:contentView.bottomAnchor constant:-18],

        [self.loadingLabel.centerXAnchor constraintEqualToAnchor:self.webView.centerXAnchor],
        [self.loadingLabel.centerYAnchor constraintEqualToAnchor:self.webView.centerYAnchor]
    ]];

    [self.window makeKeyAndOrderFront:nil];
}

- (NSButton *)makeHeaderButtonWithTitle:(NSString *)title action:(SEL)action {
    NSButton *button = [NSButton buttonWithTitle:title target:self action:action];
    button.bezelStyle = NSBezelStyleRounded;
    button.font = [NSFont systemFontOfSize:13 weight:NSFontWeightSemibold];
    button.translatesAutoresizingMaskIntoConstraints = NO;
    return button;
}

- (NSString *)formattedByteCount:(unsigned long long)bytes {
    NSByteCountFormatter *formatter = [NSByteCountFormatter new];
    formatter.allowedUnits = NSByteCountFormatterUseMB | NSByteCountFormatterUseGB;
    formatter.countStyle = NSByteCountFormatterCountStyleFile;
    return [formatter stringFromByteCount:(long long)bytes];
}

- (NSString *)javaScriptLiteralFromString:(NSString *)string {
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:@[string ?: @""] options:0 error:nil];
    if (!jsonData) {
        return @"\"\"";
    }

    NSString *json = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding] ?: @"[\"\"]";
    if (json.length >= 2) {
        return [json substringWithRange:NSMakeRange(1, json.length - 2)];
    }
    return @"\"\"";
}

- (void)postNativeStatusBadge:(NSString *)badge
                        title:(NSString *)title
                      message:(NSString *)message
                         busy:(BOOL)busy {
    if (!self.webView) {
        return;
    }

    NSDictionary *payload = @{
        @"badge": badge ?: @"Info",
        @"title": title ?: @"Operation en cours",
        @"message": message ?: @"",
        @"busy": @(busy)
    };

    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
    NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding] ?: @"{}";
    NSString *script = [NSString stringWithFormat:@"window.__swapmodSetNativeStatus(%@);", jsonString];

    dispatch_async(dispatch_get_main_queue(), ^{
        self.helperLabel.stringValue = title ?: @"Operation en cours";
        [self.webView evaluateJavaScript:script completionHandler:nil];
    });
}

- (void)clearNativeStatus {
    dispatch_async(dispatch_get_main_queue(), ^{
        self.helperLabel.stringValue = @"Ready";
        [self.webView evaluateJavaScript:@"window.__swapmodClearNativeStatus();" completionHandler:nil];
    });
}

- (void)injectFilesIntoWebView:(NSArray<NSDictionary *> *)payloads {
    if (!payloads.count) {
        return;
    }

    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:payloads options:0 error:nil];
    if (!jsonData) {
        return;
    }

    NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
    NSString *script = [NSString stringWithFormat:@"window.__swapmodImportFromNative(%@);", jsonString ?: @"[]"];
    [self.webView evaluateJavaScript:script completionHandler:^(id _Nullable result, NSError * _Nullable error) {
        if (error) {
            self.helperLabel.stringValue = @"Import natif impossible";
            [self postNativeStatusBadge:@"Erreur"
                                  title:@"Import impossible"
                                message:@"Les fichiers n'ont pas pu etre injectes dans l'interface."
                                   busy:NO];
            return;
        }

        [self postNativeStatusBadge:@"OK"
                              title:@"Import termine"
                            message:[NSString stringWithFormat:@"%lu fichier(s) ajoute(s) a la queue.", (unsigned long)payloads.count]
                               busy:NO];
    }];
}

- (void)presentNativeFilePicker {
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.canChooseFiles = YES;
    panel.canChooseDirectories = NO;
    panel.allowsMultipleSelection = YES;
    panel.resolvesAliases = YES;
    panel.message = @"Choisis un ou plusieurs fichiers .gcode.3mf deja tranches";

    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
        if (result != NSModalResponseOK) {
            [self clearNativeStatus];
            return;
        }

        self.helperLabel.stringValue = @"Lecture des fichiers...";
        [self postNativeStatusBadge:@"Analyse"
                              title:@"Lecture des fichiers"
                            message:@"Verification locale des projets 3MF tranches."
                               busy:YES];

        dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
            NSMutableArray<NSDictionary *> *payloads = [NSMutableArray array];
            NSError *firstError = nil;
            for (NSURL *originalURL in panel.URLs) {
                NSString *lowerName = originalURL.lastPathComponent.lowercaseString;
                if (![lowerName hasSuffix:@".3mf"]) {
                    if (!firstError) {
                        firstError = [NSError errorWithDomain:@"SwapmodLocal" code:20 userInfo:@{
                            NSLocalizedDescriptionKey: @"Seuls les projets 3MF tranches sont acceptes."
                        }];
                    }
                    continue;
                }

                NSData *data = [NSData dataWithContentsOfURL:originalURL];
                if (!data) {
                    continue;
                }

                NSString *base64 = [data base64EncodedStringWithOptions:0];
                [payloads addObject:@{
                    @"name": originalURL.lastPathComponent ?: @"import.3mf",
                    @"mimeType": @"application/octet-stream",
                    @"base64": base64 ?: @""
                }];
            }

            dispatch_async(dispatch_get_main_queue(), ^{
                if (!payloads.count) {
                    self.helperLabel.stringValue = firstError.localizedDescription ?: @"Aucun fichier importable";
                    [self postNativeStatusBadge:@"Erreur"
                                          title:@"Import impossible"
                                        message:firstError.localizedDescription ?: @"Aucun fichier importable n'a ete produit."
                                           busy:NO];
                    return;
                }

                [self postNativeStatusBadge:@"Import"
                                      title:@"Injection dans l'interface"
                                    message:[NSString stringWithFormat:@"%lu fichier(s) pret(s), ajout a la queue en cours...", (unsigned long)payloads.count]
                                       busy:YES];
                [self injectFilesIntoWebView:payloads];
            });
        });
    }];
}

- (void)presentSavePanelForFilename:(NSString *)filename
                           mimeType:(NSString *)mimeType
                               data:(NSData *)data {
    if (!data) {
        return;
    }

    NSSavePanel *panel = [NSSavePanel savePanel];
    panel.nameFieldStringValue = filename.length ? filename : @"swap-output.3mf";
    panel.canCreateDirectories = YES;
    panel.extensionHidden = NO;

    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
        if (result != NSModalResponseOK || !panel.URL) {
            return;
        }

        NSError *writeError = nil;
        if (![data writeToURL:panel.URL options:NSDataWritingAtomic error:&writeError]) {
            self.helperLabel.stringValue = writeError.localizedDescription ?: @"Echec de sauvegarde";
            return;
        }

        self.helperLabel.stringValue = [NSString stringWithFormat:@"Sauve: %@", panel.URL.lastPathComponent];
    }];
}

- (void)loadBundledUI {
    NSURL *indexURL = [self.processRunner.appRootURL URLByAppendingPathComponent:@"web/index.html"];
    self.bundleIndexURL = indexURL;

    if (![[NSFileManager defaultManager] fileExistsAtPath:indexURL.path]) {
        self.helperLabel.stringValue = @"Fichiers web manquants";
        self.loadingLabel.stringValue = @"index.html introuvable dans le bundle";
        return;
    }

    self.helperLabel.stringValue = @"Running bundled app";
    [self.webView loadFileURL:indexURL allowingReadAccessToURL:[self.processRunner.appRootURL URLByAppendingPathComponent:@"web" isDirectory:YES]];
    self.webView.hidden = NO;
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    self.loadingLabel.hidden = YES;
    self.helperLabel.stringValue = @"Ready";
    [self clearNativeStatus];
}

- (IBAction)openInBrowser:(id)sender {
    NSError *error = nil;
    NSURL *url = [self.processRunner launchServerReturningError:&error];
    if (url) {
        self.serverURL = url;
        [[NSWorkspace sharedWorkspace] openURL:url];
    } else {
        self.helperLabel.stringValue = error.localizedDescription ?: @"Impossible d'ouvrir le navigateur";
    }
}

- (IBAction)reloadPage:(id)sender {
    [self.webView reload];
}

- (IBAction)addFiles:(id)sender {
    [self presentNativeFilePicker];
}

- (IBAction)showAboutPanel:(id)sender {
    NSAlert *alert = [NSAlert new];
    alert.alertStyle = NSAlertStyleInformational;
    alert.messageText = @"SwapList Local pour Swapmod";
    alert.informativeText = @"Version 2.0\n\nL'application combine localement des projets .gcode.3mf deja tranches. Elle ne contacte pas swaplist.app et ne remplace pas Bambu Studio ou Orca Slicer.";
    [alert addButtonWithTitle:@"OK"];
    [alert beginSheetModalForWindow:self.window completionHandler:nil];
}

- (void)webView:(WKWebView *)webView
runOpenPanelWithParameters:(WKOpenPanelParameters *)parameters
initiatedByFrame:(WKFrameInfo *)frame
completionHandler:(void (^)(NSArray<NSURL *> * _Nullable URLs))completionHandler {
    [self presentNativeFilePicker];
    completionHandler(nil);
}

- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.name isEqualToString:@"swapmodApp"]) {
        return;
    }

    if (![message.body isKindOfClass:[NSDictionary class]]) {
        return;
    }

    NSDictionary *payload = (NSDictionary *)message.body;
    NSString *type = payload[@"type"];
    if (![type isEqualToString:@"saveBlob"]) {
        return;
    }

    NSString *filename = payload[@"filename"] ?: @"swap-output.3mf";
    NSString *mimeType = payload[@"mimeType"] ?: @"application/octet-stream";
    NSString *base64 = payload[@"base64"];
    NSData *data = [[NSData alloc] initWithBase64EncodedString:base64 ?: @"" options:0];
    [self presentSavePanelForFilename:filename mimeType:mimeType data:data];
}

@end

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        NSApplication *app = [NSApplication sharedApplication];
        AppDelegate *delegate = [AppDelegate new];
        app.delegate = delegate;
        [app run];
    }
    return 0;
}
