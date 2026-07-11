@echo off
set OLLAMA_NUM_GPU=0
set CUDA_VISIBLE_DEVICES=-1
set OLLAMA_HOST=0.0.0.0:11434
start "" ollama serve
