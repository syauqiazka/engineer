"""
Routes Autentikasi dan Pengguna (Fase 2).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel

from app.security.auth import Session, get_auth_manager, get_current_user, require_role

router = APIRouter(prefix="/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    user_id: str
    username: str
    role: str
    expires_at: float


class UserInfoResponse(BaseModel):
    user_id: str
    username: str
    role: str


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, response: Response):
    auth = get_auth_manager()
    user = auth.authenticate(payload.username, payload.password)
    if not user:
        auth.log_audit(
            username=payload.username,
            role="none",
            action="login",
            target="auth",
            status="failed",
            details="Kredensial tidak valid",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nama pengguna atau kata sandi salah.",
        )

    sess = auth.create_session(user)
    auth.log_audit(
        username=user.username,
        role=user.role,
        action="login",
        target="auth",
        status="success",
    )

    response.set_cookie(
        key="engineer_session",
        value=sess.token,
        httponly=True,
        samesite="lax",
        max_age=86400,
    )

    return LoginResponse(
        token=sess.token,
        user_id=sess.user_id,
        username=sess.username,
        role=sess.role,
        expires_at=sess.expires_at,
    )


@router.post("/logout")
def logout(response: Response, user: Session = Depends(get_current_user)):
    auth = get_auth_manager()
    auth.revoke_session(user.token)
    auth.log_audit(
        username=user.username,
        role=user.role,
        action="logout",
        target="auth",
        status="success",
    )
    response.delete_cookie(key="engineer_session")
    return {"message": "Berhasil logout."}


@router.get("/me", response_model=UserInfoResponse)
def get_me(user: Session = Depends(get_current_user)):
    return UserInfoResponse(
        user_id=user.user_id,
        username=user.username,
        role=user.role,
    )


@router.get("/users")
def list_users(user: Session = Depends(require_role("admin"))):
    auth = get_auth_manager()
    return auth.list_users()


@router.get("/audit")
def get_audit_logs(
    limit: int = 50,
    user: Session = Depends(require_role("admin")),
):
    auth = get_auth_manager()
    return auth.get_recent_audit_logs(limit=limit)
