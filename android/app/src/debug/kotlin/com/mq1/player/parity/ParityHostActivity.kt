package com.mq1.player.parity

import androidx.activity.ComponentActivity

/**
 * Debug-only host for visual-parity screenshot tests: launched with the
 * REAL production theme (Theme.MQPlayer — NoActionBar, dark window bg),
 * so captured PNGs match production chrome. Never shipped in release.
 */
class ParityHostActivity : ComponentActivity()
