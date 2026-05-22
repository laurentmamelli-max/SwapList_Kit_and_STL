#import <AppKit/AppKit.h>

static void DrawIcon(NSRect rect) {
    NSBezierPath *rounded = [NSBezierPath bezierPathWithRoundedRect:rect xRadius:rect.size.width * 0.23 yRadius:rect.size.width * 0.23];
    NSGradient *background = [[NSGradient alloc] initWithColors:@[
        [NSColor colorWithCalibratedRed:0.95 green:0.93 blue:0.88 alpha:1.0],
        [NSColor colorWithCalibratedRed:0.89 green:0.95 blue:0.92 alpha:1.0]
    ]];
    [background drawInBezierPath:rounded angle:-45];

    NSShadow *shadow = [NSShadow new];
    shadow.shadowColor = [NSColor colorWithCalibratedWhite:0 alpha:0.18];
    shadow.shadowBlurRadius = rect.size.width * 0.05;
    shadow.shadowOffset = NSMakeSize(0, -rect.size.width * 0.015);
    [shadow set];

    NSRect cardRect = NSInsetRect(rect, rect.size.width * 0.16, rect.size.height * 0.15);
    NSBezierPath *cardPath = [NSBezierPath bezierPathWithRoundedRect:cardRect xRadius:rect.size.width * 0.10 yRadius:rect.size.width * 0.10];
    NSGradient *cardGradient = [[NSGradient alloc] initWithColors:@[
        [NSColor colorWithCalibratedRed:0.10 green:0.61 blue:0.48 alpha:1.0],
        [NSColor colorWithCalibratedRed:0.05 green:0.43 blue:0.35 alpha:1.0]
    ]];
    [cardGradient drawInBezierPath:cardPath angle:-90];

    [NSGraphicsContext saveGraphicsState];
    [cardPath addClip];

    CGFloat plateHeight = rect.size.height * 0.11;
    CGFloat plateInset = rect.size.width * 0.09;
    NSArray<NSNumber *> *plateOffsets = @[
        @(cardRect.origin.y + rect.size.height * 0.16),
        @(cardRect.origin.y + rect.size.height * 0.29),
        @(cardRect.origin.y + rect.size.height * 0.42)
    ];

    [plateOffsets enumerateObjectsUsingBlock:^(NSNumber * _Nonnull yNumber, NSUInteger idx, BOOL * _Nonnull stop) {
        CGFloat y = yNumber.doubleValue;
        NSRect plateRect = NSMakeRect(cardRect.origin.x + plateInset, y, cardRect.size.width - plateInset * 2, plateHeight);
        NSBezierPath *platePath = [NSBezierPath bezierPathWithRoundedRect:plateRect xRadius:plateHeight * 0.38 yRadius:plateHeight * 0.38];
        NSArray<NSColor *> *colors = @[
            [NSColor colorWithCalibratedRed:0.98 green:0.91 - idx * 0.04 blue:0.63 alpha:1.0],
            [NSColor colorWithCalibratedRed:0.92 green:0.49 + idx * 0.04 blue:0.27 alpha:1.0]
        ];
        NSGradient *plateGradient = [[NSGradient alloc] initWithColors:colors];
        [plateGradient drawInBezierPath:platePath angle:0];
    }];

    NSBezierPath *arrowPath = [NSBezierPath bezierPath];
    CGFloat midX = NSMidX(rect);
    CGFloat midY = NSMaxY(cardRect) - rect.size.height * 0.18;
    CGFloat radius = rect.size.width * 0.16;
    arrowPath.lineWidth = rect.size.width * 0.045;
    arrowPath.lineCapStyle = NSLineCapStyleRound;

    [arrowPath appendBezierPathWithArcWithCenter:NSMakePoint(midX - rect.size.width * 0.055, midY)
                                          radius:radius
                                      startAngle:230
                                        endAngle:20
                                       clockwise:NO];
    [arrowPath moveToPoint:NSMakePoint(midX + rect.size.width * 0.14, midY + rect.size.height * 0.07)];
    [arrowPath lineToPoint:NSMakePoint(midX + rect.size.width * 0.22, midY + rect.size.height * 0.10)];
    [arrowPath lineToPoint:NSMakePoint(midX + rect.size.width * 0.17, midY + rect.size.height * 0.02)];

    [arrowPath appendBezierPathWithArcWithCenter:NSMakePoint(midX + rect.size.width * 0.055, midY - rect.size.height * 0.05)
                                          radius:radius
                                      startAngle:50
                                        endAngle:200
                                       clockwise:NO];
    [arrowPath moveToPoint:NSMakePoint(midX - rect.size.width * 0.16, midY - rect.size.height * 0.16)];
    [arrowPath lineToPoint:NSMakePoint(midX - rect.size.width * 0.24, midY - rect.size.height * 0.18)];
    [arrowPath lineToPoint:NSMakePoint(midX - rect.size.width * 0.18, midY - rect.size.height * 0.10)];

    [[NSColor whiteColor] setStroke];
    [arrowPath stroke];
    [NSGraphicsContext restoreGraphicsState];
}

static BOOL SaveIcon(NSURL *outputDirectory, NSInteger size, NSInteger scale, NSError **error) {
    CGFloat pixelSize = (CGFloat)(size * scale);
    NSImage *image = [[NSImage alloc] initWithSize:NSMakeSize(pixelSize, pixelSize)];

    [image lockFocus];
    DrawIcon(NSMakeRect(0, 0, pixelSize, pixelSize));
    [image unlockFocus];

    NSData *tiffData = [image TIFFRepresentation];
    NSBitmapImageRep *rep = [NSBitmapImageRep imageRepWithData:tiffData];
    NSData *pngData = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
    if (!pngData) {
        return NO;
    }

    NSString *suffix = scale == 2 ? @"@2x" : @"";
    NSString *fileName = [NSString stringWithFormat:@"icon_%ldx%ld%@.png", (long)size, (long)size, suffix];
    return [pngData writeToURL:[outputDirectory URLByAppendingPathComponent:fileName] options:NSDataWritingAtomic error:error];
}

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        if (argc < 2) {
            fprintf(stderr, "Usage: IconGenerator <output-directory>\n");
            return 2;
        }

        NSURL *outputDirectory = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]] isDirectory:YES];
        [[NSFileManager defaultManager] removeItemAtURL:outputDirectory error:nil];
        [[NSFileManager defaultManager] createDirectoryAtURL:outputDirectory withIntermediateDirectories:YES attributes:nil error:nil];

        NSArray<NSNumber *> *sizes = @[@16, @32, @128, @256, @512];
        NSError *error = nil;
        for (NSNumber *sizeNumber in sizes) {
            NSInteger size = sizeNumber.integerValue;
            if (!SaveIcon(outputDirectory, size, 1, &error) || !SaveIcon(outputDirectory, size, 2, &error)) {
                fprintf(stderr, "%s\n", error.localizedDescription.UTF8String);
                return 1;
            }
        }
    }
    return 0;
}
