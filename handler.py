def handler(job):
    job_input = job.get("input", {}) or {}

    requested_model = job_input.get("model") or env_str("OCD_MODEL", "fast")
    cfg = get_pipeline_config(requested_model)

    video_url = job_input.get("videoUrl") or job_input.get("url")
    target_lang = job_input.get("targetLang", "ar")
    source_lang = job_input.get("sourceLang", "auto")

    job_id = job.get("id") or "local_job"
    job_dir = Path("/runpod-volume/one-click-dub/jobs") / str(job_id)
    job_dir.mkdir(parents=True, exist_ok=True)

    print("OCD:", cfg)

    audio_path = download_video_audio(video_url, job_dir)

    segments = transcribe_audio(
        audio_path=audio_path,
        whisper_model=cfg["whisper_model"],
        source_lang=source_lang,
    )

    if cfg["auto_clone"]:
        ref_audio_path, ref_text = create_auto_clone_reference(
            source_audio_path=audio_path,
            segments=segments,
            job_dir=job_dir,
            seconds=cfg["ref_seconds"],
        )
    else:
        ref_audio_path, ref_text = None, None

    text = segments_to_text(segments)

    if cfg["use_punctuation"]:
        text = restore_punctuation(text)

    translated_text = translate_text(
        text=text,
        target_lang=target_lang,
        engine=cfg["translation_engine"],
        nllb_model=cfg.get("nllb_model"),
    )

    if cfg["use_catt"] and target_lang.startswith("ar"):
        translated_text = apply_catt_tashkeel(translated_text)

    chunks = smart_chunk_text(
        translated_text,
        max_chars=cfg["chunk_max_chars"],
    )

    final_audio_path = synthesize_dubbed_audio(
        chunks=chunks,
        cfg=cfg,
        job_dir=job_dir,
        ref_audio_path=ref_audio_path,
        ref_text=ref_text,
    )

    return build_audio_response(final_audio_path, cfg)
