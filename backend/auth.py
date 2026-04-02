"""
Authentication middleware for Moodle integration
"""

import jwt
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict
from fastapi import Header, HTTPException, Depends, Request
from config import MOODLE_JWT_SECRET, MOODLE_INTEGRATION

logger = logging.getLogger(__name__)


class MoodleUser:
    """Moodle user context extracted from JWT"""
    
    def __init__(self, userid: int, username: str, contextid: int, roles: list):
        self.userid = userid
        self.username = username
        self.contextid = contextid
        self.roles = roles
        
    def has_capability(self, capability: str) -> bool:
        """Check if user has a specific capability based on roles"""
        # Map roles to capabilities
        capability_map = {
            'admin': ['view', 'annotate', 'manage', 'viewall'],
            'editingteacher': ['view', 'annotate', 'manage', 'viewall'],
            'teacher': ['view', 'annotate', 'viewall'],
            'student': ['view', 'annotate'],
        }
        
        for role in self.roles:
            if capability in capability_map.get(role, []):
                return True
        return False


def create_moodle_jwt(userid: int, username: str, contextid: int, roles: list, 
                      expires_minutes: int = 60) -> str:
    """
    Create a JWT token for Moodle user (used by PHP plugin)
    
    Args:
        userid: Moodle user ID
        username: Moodle username
        contextid: Moodle context ID (activity/course)
        roles: List of role shortnames (e.g., ['student', 'teacher'])
        expires_minutes: Token expiration time in minutes
        
    Returns:
        JWT token string
    """
    payload = {
        'userid': userid,
        'username': username,
        'contextid': contextid,
        'roles': roles,
        'exp': datetime.utcnow() + timedelta(minutes=expires_minutes),
        'iat': datetime.utcnow(),
    }
    
    token = jwt.encode(payload, MOODLE_JWT_SECRET, algorithm='HS256')
    return token


def verify_moodle_jwt(authorization: Optional[str] = Header(None), request: Request = None) -> MoodleUser:
    """
    Verify and decode Moodle JWT token from Authorization header
    
    Args:
        authorization: Authorization header value (Bearer <token>)
        
    Returns:
        MoodleUser object with user context
        
    Raises:
        HTTPException: If token is invalid or missing
    """
    # Skip auth if Moodle integration is disabled
    if not MOODLE_INTEGRATION:
        # Return a default user for standalone mode
        return MoodleUser(userid=1, username='standalone', contextid=0, roles=['admin'])
    
    # If Authorization header is missing, allow `?token=` fallback (used by <video> src)
    if not authorization:
        if request is not None:
            qtoken = request.query_params.get('token')
            if qtoken:
                authorization = f"Bearer {qtoken}"
    
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    
    # Extract token from "Bearer <token>"
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        raise HTTPException(status_code=401, detail="Invalid authorization header format")
    
    token = parts[1]
    
    try:
        # Decode and verify JWT
        payload = jwt.decode(token, MOODLE_JWT_SECRET, algorithms=['HS256'])

        # Extract and coerce user context (accept numeric strings safely)
        userid_raw = payload.get('userid')
        try:
            userid = int(userid_raw) if userid_raw is not None else None
        except (TypeError, ValueError):
            raise HTTPException(status_code=401, detail="Invalid token payload (userid)")

        username = payload.get('username')

        contextid_raw = payload.get('contextid')
        try:
            contextid = int(contextid_raw) if contextid_raw is not None else None
        except (TypeError, ValueError):
            contextid = None

        roles = payload.get('roles', [])
        if not isinstance(roles, list):
            roles = [roles] if roles else []

        if not userid or not username:
            raise HTTPException(status_code=401, detail="Invalid token payload")

        logger.debug(f"Authenticated Moodle user: {username} (ID: {userid}, Context: {contextid})")

        return MoodleUser(userid=userid, username=username, contextid=contextid, roles=roles)

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as e:
        logger.error(f"Invalid JWT token: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")


# Optional dependency for endpoints that require specific capabilities
def require_capability(capability: str):
    """
    Dependency factory for checking user capabilities
    
    Usage:
        @app.get("/api/videos")
        async def list_videos(user: MoodleUser = Depends(require_capability('view'))):
            ...
    """
    def capability_checker(user: MoodleUser = Depends(verify_moodle_jwt)) -> MoodleUser:
        if not user.has_capability(capability):
            raise HTTPException(
                status_code=403, 
                detail=f"User does not have '{capability}' capability"
            )
        return user
    
    return capability_checker
