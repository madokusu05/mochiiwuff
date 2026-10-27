# Mika — chat local

Une petite interface web en français pour discuter avec le modèle `mika` dans Ollama, avec un avatar cyberpunk original pour Mika. Le serveur Python et le modèle tournent sur ton ordinateur ; aucun service d'IA en ligne ni paquet Python supplémentaire n'est requis.

## Prérequis

- Ollama installé et lancé.
- Le modèle personnalisé `mika` créé à partir de ton `Modelfile`.
- Python 3 installé.

Dans PowerShell, tu peux vérifier ces deux derniers points avec :

```powershell
ollama list
python --version
```

La liste Ollama doit contenir `mika`.

## Démarrer sur l'ordinateur

Ouvre PowerShell, va dans le dossier `mika-chat` du dépôt puis démarre le serveur :

```powershell
cd chemin\vers\mochiiwuff\mika-chat
python server.py
```

Ouvre ensuite <http://localhost:8000> dans ton navigateur. Laisse la fenêtre PowerShell ouverte pendant l'utilisation ; `Ctrl+C` arrête le serveur.

## Accéder depuis un téléphone sur le même Wi-Fi

Sur l'ordinateur, démarre le serveur en autorisant les connexions du réseau local :

```powershell
python server.py --host 0.0.0.0
```

Si le pare-feu Windows le demande, autorise Python uniquement sur les réseaux privés. Sur l'ordinateur, lance `ipconfig` et repère l'adresse IPv4 de la connexion Wi-Fi, par exemple `192.168.1.25`. Depuis le téléphone connecté au même Wi-Fi, ouvre `http://192.168.1.25:8000` en remplaçant l'exemple par l'adresse trouvée.

N'active cet accès que sur un réseau de confiance. N'expose pas le port 8000 sur Internet et n'utilise pas cette option sur un réseau public. Ollama reste accessible uniquement depuis l'ordinateur ; seul le serveur de chat reçoit les connexions du réseau local.

## Avatar 3D flottant sur le bureau Windows

L'avatar de bureau utilise le fichier VRM que tu as exporté depuis VRoid Studio. Il reste local au projet et n'est pas ajouté à Git.

1. Installe Node.js 22.12 ou une version plus récente depuis <https://nodejs.org/>.
2. Vérifie que `mika-chat\models\Mika.vrm` existe.
3. Ouvre PowerShell dans `mika-chat\desktop` et installe les dépendances une fois :

   ```powershell
   npm install
   ```

4. Lance l'application :

   ```powershell
   npm start
   ```

L'application démarre le serveur Python du chat, puis affiche Mika dans une fenêtre transparente qui reste au-dessus des autres fenêtres. Pour les modèles VRM 0.x, elle réapplique les textures définies dans l'export VRoid et les affiche en couleurs sRGB. Au repos, elle respire, cligne des yeux et bouge légèrement ; pendant qu'Ollama prépare sa réponse, elle bouge la tête et les bras et anime la bouche si le modèle contient cette expression. Mika se cache quand tu passes à une autre fenêtre ; clique sur son icône près de l'horloge pour l'afficher de nouveau. Le menu de cette icône permet aussi de quitter l'application. Quand tu survoles Mika, les boutons permettent d'ouvrir le chat ou de mettre ses déplacements en pause. Tu peux aussi faire glisser Mika pour la déplacer. Ollama doit être lancé avec le modèle `mika` disponible.

## Mémoire et confidentialité

L'historique de la conversation est gardé temporairement dans la page ouverte et envoyé au modèle local pour générer les réponses. Il n'est pas écrit dans un fichier et disparaît quand tu actualises ou fermes la page. Le bouton **Effacer** vide aussi la conversation en cours.

Pour modifier la personnalité de Mika, change les consignes dans ton fichier `Modelfile`, puis recrée le modèle avec `ollama create mika -f "$HOME\Mika\Modelfile"`.

## Dépannage

- Si l'interface indique qu'elle ne peut pas joindre Ollama, vérifie qu'Ollama est lancé et que `ollama list` affiche `mika`.
- Si `python` n'est pas reconnu, installe Python 3 pour Windows, puis rouvre PowerShell.
- Si le téléphone ne se connecte pas, vérifie qu'il est sur le même Wi-Fi, que le serveur a été lancé avec `--host 0.0.0.0` et que Windows autorise Python sur le réseau privé.
