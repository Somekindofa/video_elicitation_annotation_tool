"""
WebDAV helper for OwnCloud uploads and listing
"""

from __future__ import annotations

import os
from typing import List, Dict, Optional
from urllib.parse import quote, unquote
import xml.etree.ElementTree as ET

import aiohttp


class WebDavError(RuntimeError):
    pass


def _encode_path(path: str) -> str:
    parts = [quote(p) for p in path.strip("/").split("/") if p]
    return "/".join(parts)


class WebDavClient:
    def __init__(self, base_url: str, username: str, password: str, base_folder: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.base_folder = base_folder.strip("/")

    def _url_for(self, rel_path: str) -> str:
        encoded = _encode_path(rel_path)
        return f"{self.base_url}/{encoded}"

    def user_root(self, user_id: int) -> str:
        return f"{self.base_folder}/{user_id}"

    def build_path(self, user_id: int, folder: Optional[str], filename: Optional[str]) -> str:
        parts = [self.base_folder, str(user_id)]
        if folder:
            parts.append(folder.strip("/"))
        if filename:
            parts.append(filename)
        return "/".join(parts)

    def auth(self) -> aiohttp.BasicAuth:
        return aiohttp.BasicAuth(self.username, self.password)

    async def ensure_collection(self, session: aiohttp.ClientSession, rel_path: str) -> None:
        url = self._url_for(rel_path)
        async with session.request("MKCOL", url, auth=self.auth()) as resp:
            if resp.status in (201, 405):
                return
            text = await resp.text()
            raise WebDavError(f"MKCOL failed ({resp.status}): {text}")

    async def upload_file(self, session: aiohttp.ClientSession, rel_path: str, upload) -> None:
        url = self._url_for(rel_path)

        async def gen():
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                yield chunk

        headers = {}
        if getattr(upload, "content_type", None):
            headers["Content-Type"] = upload.content_type

        async with session.put(url, data=gen(), headers=headers, auth=self.auth()) as resp:
            if resp.status not in (201, 204):
                text = await resp.text()
                raise WebDavError(f"PUT failed ({resp.status}): {text}")

    async def list_directory(self, session: aiohttp.ClientSession, rel_path: str) -> List[Dict[str, str]]:
        url = self._url_for(rel_path)
        headers = {"Depth": "1"}
        async with session.request("PROPFIND", url, headers=headers, auth=self.auth()) as resp:
            if resp.status not in (200, 207):
                text = await resp.text()
                raise WebDavError(f"PROPFIND failed ({resp.status}): {text}")
            body = await resp.text()

        ns = {"d": "DAV:"}
        root = ET.fromstring(body)
        items: List[Dict[str, str]] = []
        for response in root.findall("d:response", ns):
            href = response.findtext("d:href", default="", namespaces=ns)
            prop = response.find("d:propstat/d:prop", ns)
            if prop is None:
                continue

            res_type = prop.find("d:resourcetype", ns)
            is_dir = res_type is not None and res_type.find("d:collection", ns) is not None

            name = href.rstrip("/").split("/")[-1]
            if not name:
                continue

            # Decode URL-encoded names (e.g., "Moodle%20Backup" → "Moodle Backup")
            name = unquote(name)
            items.append({"name": name, "href": href, "is_dir": is_dir})

        return items
