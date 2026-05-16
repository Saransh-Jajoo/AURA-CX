"""Tenant-namespaced vector search adapters for Pinecone and Chroma."""

from __future__ import annotations

import logging
from typing import Any

from config import settings

logger = logging.getLogger("aura_cx.vector")


def tenant_namespace(tenant_id: str, bucket: str) -> str:
    return f"{tenant_id}:{bucket}"


async def query_vectors(
    *,
    tenant_id: str,
    bucket: str,
    vector: list[float],
    top_k: int = 5,
    include_values: bool = False,
) -> list[dict[str, Any]]:
    if not vector:
        return []
    if settings.VECTOR_PROVIDER == "pinecone":
        return await _query_pinecone(tenant_id, bucket, vector, top_k, include_values)
    return await _query_chroma(tenant_id, bucket, vector, top_k)


async def upsert_vector(
    *,
    tenant_id: str,
    bucket: str,
    vector_id: str,
    vector: list[float],
    metadata: dict,
) -> None:
    if not vector:
        return
    if settings.VECTOR_PROVIDER == "pinecone":
        await _upsert_pinecone(tenant_id, bucket, vector_id, vector, metadata)
    else:
        await _upsert_chroma(tenant_id, bucket, vector_id, vector, metadata)


async def _query_pinecone(
    tenant_id: str,
    bucket: str,
    vector: list[float],
    top_k: int,
    include_values: bool,
) -> list[dict[str, Any]]:
    if not settings.PINECONE_API_KEY or not settings.PINECONE_HOST:
        return []
    try:
        from pinecone import Pinecone

        index = Pinecone(api_key=settings.PINECONE_API_KEY).Index(host=settings.PINECONE_HOST)
        result = index.query(
            vector=vector,
            top_k=top_k,
            namespace=tenant_namespace(tenant_id, bucket),
            include_metadata=True,
            include_values=include_values,
        )
        return [
            {
                "id": match.get("id"),
                "score": float(match.get("score") or 0),
                "metadata": match.get("metadata") or {},
                "values": match.get("values") or [],
            }
            for match in result.get("matches", [])
        ]
    except Exception:
        logger.exception("Pinecone query failed")
        return []


async def _upsert_pinecone(tenant_id: str, bucket: str, vector_id: str, vector: list[float], metadata: dict) -> None:
    if not settings.PINECONE_API_KEY or not settings.PINECONE_HOST:
        return
    try:
        from pinecone import Pinecone

        index = Pinecone(api_key=settings.PINECONE_API_KEY).Index(host=settings.PINECONE_HOST)
        index.upsert(
            vectors=[{"id": vector_id, "values": vector, "metadata": metadata}],
            namespace=tenant_namespace(tenant_id, bucket),
        )
    except Exception:
        logger.exception("Pinecone upsert failed")


async def _query_chroma(tenant_id: str, bucket: str, vector: list[float], top_k: int) -> list[dict[str, Any]]:
    try:
        import chromadb

        client = chromadb.HttpClient(host=settings.CHROMA_HOST, port=settings.CHROMA_PORT)
        collection = client.get_or_create_collection(settings.CHROMA_COLLECTION)
        result = collection.query(
            query_embeddings=[vector],
            n_results=top_k,
            where={"namespace": tenant_namespace(tenant_id, bucket)},
        )
        ids = result.get("ids", [[]])[0]
        distances = result.get("distances", [[]])[0]
        metadatas = result.get("metadatas", [[]])[0]
        matches = []
        for index, vector_id in enumerate(ids):
            distance = float(distances[index]) if index < len(distances) else 1.0
            matches.append(
                {
                    "id": vector_id,
                    "score": max(0.0, 1.0 - distance),
                    "metadata": metadatas[index] if index < len(metadatas) else {},
                    "values": [],
                }
            )
        return matches
    except Exception:
        logger.exception("Chroma query failed")
        return []


async def _upsert_chroma(tenant_id: str, bucket: str, vector_id: str, vector: list[float], metadata: dict) -> None:
    try:
        import chromadb

        client = chromadb.HttpClient(host=settings.CHROMA_HOST, port=settings.CHROMA_PORT)
        collection = client.get_or_create_collection(settings.CHROMA_COLLECTION)
        safe_metadata = {k: v for k, v in metadata.items() if isinstance(v, str | int | float | bool)}
        safe_metadata["namespace"] = tenant_namespace(tenant_id, bucket)
        collection.upsert(ids=[vector_id], embeddings=[vector], metadatas=[safe_metadata])
    except Exception:
        logger.exception("Chroma upsert failed")

