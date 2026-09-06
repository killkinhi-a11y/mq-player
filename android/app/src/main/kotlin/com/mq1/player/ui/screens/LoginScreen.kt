package com.mq1.player.ui.screens

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.mq1.player.data.LocalStore
import com.mq1.player.di.ServiceLocator
import kotlinx.coroutines.launch

/**
 * Telegram-code login — native implementation of the web flow:
 * 1. open bot (t.me/<bot>?start=code) via Intent
 * 2. enter 6-digit code
 * 3. new users: pick a username
 */
@Composable
fun LoginScreen(onLoggedIn: (LocalStore.SessionUser) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val auth = ServiceLocator.authRepository

    var botName by remember { mutableStateOf<String?>(null) }
    var code by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var needsUsername by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    androidx.compose.runtime.LaunchedEffect(Unit) {
        botName = auth.botName()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("MQ", style = MaterialTheme.typography.displayLarge,
            color = MaterialTheme.colorScheme.primary)
        Text("музыкальный плеер", style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(36.dp))

        Text("Вход через Telegram", style = MaterialTheme.typography.headlineSmall,
            textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(
            "Откройте бота MQ в Telegram — он пришлёт 6-значный код",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(24.dp))

        Button(
            onClick = {
                botName?.let { name ->
                    runCatching {
                        context.startActivity(
                            Intent(Intent.ACTION_VIEW, android.net.Uri.parse("https://t.me/$name?start=code"))
                        )
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = botName != null
        ) {
            Text(if (botName != null) "Открыть бота @$botName" else "Получаем имя бота…")
        }
        Spacer(Modifier.height(16.dp))

        OutlinedTextField(
            value = code,
            onValueChange = { if (it.length <= 6 && it.all(Char::isDigit)) code = it },
            label = { Text("Код из Telegram") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))

        if (needsUsername) {
            OutlinedTextField(
                value = username,
                onValueChange = { if (it.length <= 20) username = it },
                label = { Text("Имя пользователя (латиница)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(12.dp))
        }

        error?.let {
            Text(it, color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(8.dp))
        }

        Button(
            onClick = {
                if (code.length != 6 || (needsUsername && username.isBlank())) return@Button
                busy = true; error = null
                scope.launch {
                    val result = auth.verifyCode(code, username.takeIf { needsUsername })
                    busy = false
                    when {
                        result == null -> error = "Сеть недоступна. Проверьте подключение."
                        result.error != null -> error = result.error
                        result.isNewUser && !needsUsername -> {
                            needsUsername = true
                            error = "Новый пользователь — выберите имя"
                        }
                        result.userId != null -> {
                            onLoggedIn(
                                LocalStore.SessionUser(
                                    userId = result.userId ?: "",
                                    username = result.username ?: username,
                                    role = result.role ?: "user",
                                    avatar = result.avatar
                                )
                            )
                        }
                        else -> error = result.message ?: "Не удалось войти"
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = code.length == 6 && !busy &&
                    (!needsUsername || username.isNotBlank())
        ) {
            if (busy) {
                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary)
            } else {
                Text(if (needsUsername) "Создать аккаунт" else "Войти")
            }
        }
    }
}
