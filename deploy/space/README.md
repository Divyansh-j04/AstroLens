---
title: AstroLens API
emoji: 🔭
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
short_description: Recognise planets and nebulae; chat with cited sources
---

# AstroLens API

The server behind AstroLens, a student project (Computer Vision + NLP): a 3D space explorer where you upload a photo of a planet, nebula or star cluster, it recognises it and flies there, and a chat answers questions from Wikipedia and NASA texts with numbered sources.

- `GET /health`: status and the loaded model
- `POST /classify`: a photo in; the top 3 guesses, "not one of my objects" below the confidence threshold, and a Grad-CAM heatmap out
- `POST /chat`: a question in; an answer from the collected texts only, with numbered sources
- `POST /navigate`: typed text ("the red planet", "jupitr") in; where to fly out

Interactive documentation: `/docs`. The page itself is hosted on Vercel.

Classifier: EfficientNet-B0 fine-tuned on 1,401 free-licence images of 14 objects (public domain, CC0, CC BY, CC BY-SA, NASA). Chat: MiniLM search over Wikipedia (CC BY-SA 4.0) and NASA (public domain) texts, answers by `openai/gpt-oss-20b` on Groq.
